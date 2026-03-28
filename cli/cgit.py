#!/usr/bin/env python3
"""
CoNAGIT Upload Tool (standalone) - マルチパートアップロード対応
- 5GB超の巨大ファイル（最大500GB）を分割してS3にアップロード
- プログレス表示とリトライ機能を搭載
"""

import argparse
import base64
import json
import os
import re
import sys
import tempfile
import zipfile
import time
import mimetypes
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import requests

API_BASE_URL = os.environ.get("CONAGIT_API_URL", "https://tech.mmh-virtual.jp")
INLINE_MAX_SIZE = 20 * 1024 * 1024       # 20MB 超で presigned-url
MULTIPART_THRESHOLD = 1024 * 1024 * 1024 # 1GB 超でマルチパート（安全閾値）
PART_SIZE = 100 * 1024 * 1024            # 100MB/part（S3 要件は 5MB〜5GB）

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

def decode_ids(api_key: str) -> Tuple[Optional[str], Optional[str]]:
    """JWTのpayloadから (userId, projectId) を取得"""
    try:
        parts = api_key.split(".")
        if len(parts) != 3: return None, None
        payload = parts[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload))
        uid, pid = data.get("userId"), data.get("projectId")
        if not (uid and UUID_RE.match(uid)): uid = None
        if not (pid and UUID_RE.match(pid)): pid = None
        return uid, pid
    except: return None, None

def create_zip_from_directory(directory_path: str, zip_path: str) -> None:
    """無圧縮でZIP化"""
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as zipf:
        for root, dirs, files in os.walk(directory_path):
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for file in files:
                if file.startswith(".") or file.lower() == "cgit.exe": continue
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, directory_path)
                zipf.write(file_path, arcname)

def upload_zip_inline(zip_path: str, subproject_id: str, api_key: str, file_name: str) -> bool:
    """通常アップロード (20MB以下)"""
    url = f"{API_BASE_URL}/api/subprojects/{subproject_id}/upload-zip"
    headers = {"Authorization": f"Bearer {api_key}"}
    with open(zip_path, "rb") as f:
        files = {"file": (file_name, f, "application/zip")}
        print(f"アップロード中: {file_name} ...")
        resp = requests.post(url, headers=headers, files=files, data={"fileName": file_name}, timeout=120)
        return resp.status_code == 200

# --- マルチパートアップロード関連 ---

def multipart_start(subproject_id: str, user_id: str, file_name: str, file_size: int, path: str = "/", mime: str = "application/octet-stream") -> Dict[str, Any]:
    url = f"{API_BASE_URL}/api/subprojects/{subproject_id}/files/multipart-start"
    payload = {"fileName": file_name, "fileSize": file_size, "mimeType": mime, "userId": user_id, "path": path}
    resp = requests.post(url, json=payload, timeout=60)
    if resp.status_code != 200: raise RuntimeError(f"開始エラー: {resp.text}")
    return resp.json()

def get_part_url(subproject_id: str, s3_key: str, upload_id: str, part_number: int) -> str:
    url = f"{API_BASE_URL}/api/subprojects/{subproject_id}/files/multipart-url"
    payload = {"s3Key": s3_key, "uploadId": upload_id, "partNumber": part_number}
    resp = requests.post(url, json=payload, timeout=60)
    if resp.status_code != 200: raise RuntimeError(f"URL取得エラー: {resp.text}")
    return resp.json()["presignedUrl"]

def upload_part(url: str, data: bytes, part_number: int, total_parts: int):
    """パーツをアップロード (リトライ付き)"""
    for attempt in range(5):
        try:
            resp = requests.put(url, data=data, timeout=300)
            if resp.status_code == 200:
                etag = resp.headers.get("ETag")
                if etag: return etag
            print(f"  警告: パーツ {part_number} アップロード失敗 ({resp.status_code})。リトライ中... {attempt+1}/5")
        except Exception as e:
            print(f"  警告: パーツ {part_number} 通信エラー ({e})。リトライ中... {attempt+1}/5")
        time.sleep(2)
    raise RuntimeError(f"パーツ {part_number} のアップロードに最終的に失敗しました")

def multipart_complete(subproject_id: str, file_id: str, s3_key: str, upload_id: str, parts: List[Dict], user_id: str):
    url = f"{API_BASE_URL}/api/subprojects/{subproject_id}/files/multipart-complete"
    payload = {"fileId": file_id, "s3Key": s3_key, "uploadId": upload_id, "parts": parts, "userId": user_id}
    resp = requests.post(url, json=payload, timeout=120)
    if resp.status_code != 200: raise RuntimeError(f"完了通知エラー: {resp.text}")

# --- 個別アップロード (nozip) 用のヘルパー ---

EXCLUDE_NAMES = {"cgit.exe", "install.exe"}

def guess_mime(name: str) -> str:
    mt, _ = mimetypes.guess_type(name)
    return mt or "application/octet-stream"

def norm_path(rel_path: str) -> str:
    return "/" if rel_path in (".", "") else "/" + rel_path.replace("\\", "/")

def scan_items(base_dir: str):
    folders = []
    files = []
    for root, dirs, filenames in os.walk(base_dir):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        rel_root = os.path.relpath(root, base_dir)
        parent_path = norm_path(rel_root)
        for d in dirs:
            if d.startswith(".") or d.lower() in EXCLUDE_NAMES:
                continue
            folders.append({"path": parent_path, "name": d})
        for f in filenames:
            if f.startswith(".") or f.lower() in EXCLUDE_NAMES:
                continue
            full_path = os.path.join(root, f)
            files.append({"path": parent_path, "name": f, "full_path": full_path})
    # 親→子の順にフォルダを作成するため、pathの深さでソート
    folders.sort(key=lambda x: x["path"].count("/"))
    return folders, files

def create_folder_api(subproject_id: str, project_id: str, user_id: str, path: str, name: str):
    url = f"{API_BASE_URL}/api/subprojects/{subproject_id}/folders"
    payload = {"name": name, "path": path, "userId": user_id, "projectId": project_id}
    resp = requests.post(url, json=payload, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"フォルダ作成に失敗しました: {name} ({path}) -> {resp.text}")

def upload_file_single(subproject_id: str, user_id: str, project_id: str, path: str, name: str, full_path: str, size: int, mime: str):
    # presigned-url で1パートPUT
    presigned_res = requests.post(
        f"{API_BASE_URL}/api/subprojects/{subproject_id}/files/presigned-url",
        json={
            "fileName": name,
            "fileSize": size,
            "mimeType": mime,
            "path": path,
            "userId": user_id,
            "projectId": project_id,
        },
        timeout=60,
    )
    if presigned_res.status_code != 200:
        raise RuntimeError(f"presigned-url取得に失敗: {presigned_res.text}")
    data = presigned_res.json()
    presigned_url = data["presignedUrl"]
    s3_key = data["s3Key"]
    callback_url = data["callbackUrl"]

    with open(full_path, "rb") as f:
        put_resp = requests.put(presigned_url, data=f, headers={"Content-Type": mime}, timeout=600)
        if put_resp.status_code not in (200, 201):
            raise RuntimeError(f"S3アップロード失敗: {put_resp.status_code} {put_resp.text}")

    cb_resp = requests.post(f"{API_BASE_URL}{callback_url}", json={"s3Key": s3_key, "userId": user_id}, timeout=60)
    if cb_resp.status_code != 200:
        raise RuntimeError(f"upload-complete失敗: {cb_resp.text}")

def upload_file_multipart(subproject_id: str, user_id: str, project_id: str, path: str, name: str, full_path: str, size: int, mime: str):
    start_info = requests.post(
        f"{API_BASE_URL}/api/subprojects/{subproject_id}/files/multipart-start",
        json={
            "fileName": name,
            "fileSize": size,
            "mimeType": mime,
            "path": path,
            "userId": user_id,
        },
        timeout=60,
    )
    if start_info.status_code != 200:
        raise RuntimeError(f"開始エラー: {start_info.text}")
    start_data = start_info.json()
    upload_id, s3_key, file_id = start_data["uploadId"], start_data["s3Key"], start_data["fileId"]

    completed_parts = []
    total_parts = (size + PART_SIZE - 1) // PART_SIZE
    with open(full_path, "rb") as f:
        for i in range(total_parts):
            part_number = i + 1
            chunk = f.read(PART_SIZE)
            print(f"  パーツ {part_number}/{total_parts} 送信中 ({part_number/total_parts*100:.1f}%)...")
            part_url_res = requests.post(
                f"{API_BASE_URL}/api/subprojects/{subproject_id}/files/multipart-url",
                json={"s3Key": s3_key, "uploadId": upload_id, "partNumber": part_number},
                timeout=60,
            )
            if part_url_res.status_code != 200:
                raise RuntimeError(f"URL取得エラー: {part_url_res.text}")
            part_url = part_url_res.json()["presignedUrl"]
            etag = upload_part(part_url, chunk, part_number, total_parts)
            completed_parts.append({"ETag": etag, "PartNumber": part_number})

    comp_res = requests.post(
        f"{API_BASE_URL}/api/subprojects/{subproject_id}/files/multipart-complete",
        json={"fileId": file_id, "s3Key": s3_key, "uploadId": upload_id, "parts": completed_parts, "userId": user_id},
        timeout=120,
    )
    if comp_res.status_code != 200:
        raise RuntimeError(f"完了通知エラー: {comp_res.text}")

def upload_files_nozip(base_dir: str, user_id: str, project_id: str):
    folders, files = scan_items(base_dir)
    print(f"検出: フォルダ {len(folders)} 件, ファイル {len(files)} 件")

    # フォルダ作成（親から順に）
    for idx, folder in enumerate(folders, 1):
        try:
            create_folder_api(project_id, project_id, user_id, folder["path"], folder["name"])
        except Exception as e:
            raise RuntimeError(f"フォルダ作成失敗 [{idx}/{len(folders)}]: {folder['path']}/{folder['name']} ({e})")

    # ファイルアップロード
    for idx, file in enumerate(files, 1):
        full_path = file["full_path"]
        size = os.path.getsize(full_path)
        mime = guess_mime(file["name"])
        print(f"[{idx}/{len(files)}] {file['path']}/{file['name']} ({size/1024/1024:.2f} MB)")
        if size > MULTIPART_THRESHOLD:
            upload_file_multipart(project_id, user_id, project_id, file["path"], file["name"], full_path, size, mime)
        else:
            upload_file_single(project_id, user_id, project_id, file["path"], file["name"], full_path, size, mime)

def main():
    print("CoNAGIT Upload Tool (standalone)")
    print("=" * 60)
    parser = argparse.ArgumentParser()
    parser.add_argument("api_key")
    parser.add_argument("-n", "--name", dest="custom_name", help="ZIPファイル名を指定（--nozip時は無視）")
    parser.add_argument("-nozip", "--nozip", action="store_true", help="ZIP化せずに各ファイル/フォルダを個別アップロード")
    args = parser.parse_args()

    user_id, project_id = decode_ids(args.api_key)
    if not user_id or not project_id:
        print("エラー: 有効なAPIキーを入力してください"); sys.exit(1)

    timestamp = datetime.now().strftime("%Y%m%d%H%M")
    base_name = args.custom_name if args.custom_name else f"{timestamp}-{project_id}"
    file_name = base_name if base_name.lower().endswith(".zip") else f"{base_name}.zip"

    if args.nozip:
        # ZIP化せず、各ファイル/フォルダをそのままアップロード
        try:
            upload_files_nozip(os.getcwd(), user_id, project_id)
            print("\n完了！")
        except Exception as e:
            print(f"\nエラー: {e}"); sys.exit(1)
        return

    # 既存のZIPアップロードフロー
    current_dir, temp_dir = os.getcwd(), tempfile.mkdtemp(prefix="cgit_")
    zip_path = os.path.join(temp_dir, file_name)

    try:
        print(f"ZIP作成中: {current_dir}")
        create_zip_from_directory(current_dir, zip_path)
        file_size = os.path.getsize(zip_path)
        print(f"✓ ZIP作成完了: {file_size / 1024 / 1024:.2f} MB")

        if file_size <= INLINE_MAX_SIZE:
            if upload_zip_inline(zip_path, project_id, args.api_key, file_name): print("\n完了")
            else: sys.exit(1)
        
        elif file_size <= MULTIPART_THRESHOLD:
            # 1GB以下: 通常のPresigned URL (1パーツ)
            print("Presigned URL取得中...")
            url_res = requests.post(f"{API_BASE_URL}/api/subprojects/{project_id}/files/presigned-url", 
                                  json={"fileName": file_name, "fileSize": file_size, "mimeType": "application/zip", "userId": user_id}).json()
            requests.put(url_res["presignedUrl"], data=open(zip_path, "rb"), headers={"Content-Type": "application/zip"}).raise_for_status()
            requests.post(f"{API_BASE_URL}{url_res['callbackUrl']}", json={"s3Key": url_res["s3Key"], "userId": user_id}).raise_for_status()
            print("\n完了")

        else:
            # 巨大ファイル: マルチパート
            print(f"大容量モード (分割アップロード) を開始します...")
            start_info = multipart_start(project_id, user_id, file_name, file_size, path="/", mime="application/zip")
            upload_id, s3_key, file_id = start_info["uploadId"], start_info["s3Key"], start_info["fileId"]
            
            completed_parts = []
            total_parts = (file_size + PART_SIZE - 1) // PART_SIZE
            
            with open(zip_path, "rb") as f:
                for i in range(total_parts):
                    part_number = i + 1
                    chunk = f.read(PART_SIZE)
                    print(f"パーツ {part_number}/{total_parts} 送信中 ({part_number/total_parts*100:.1f}%)...")
                    
                    part_url = get_part_url(project_id, s3_key, upload_id, part_number)
                    etag = upload_part(part_url, chunk, part_number, total_parts)
                    completed_parts.append({"ETag": etag, "PartNumber": part_number})
            
            print("全パーツ完了。サーバー側で結合中...")
            multipart_complete(project_id, file_id, s3_key, upload_id, completed_parts, user_id)
            print("\n完了！")

    except Exception as e:
        print(f"\nエラー: {e}"); sys.exit(1)
    finally:
        try: shutil.rmtree(temp_dir)
        except: pass

if __name__ == "__main__":
    import shutil
    main()
