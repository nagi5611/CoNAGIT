import os
import sys
import shutil
import ctypes
import subprocess
import winreg
from pathlib import Path

# WindowsコンソールのエンコーディングをUTF-8に設定
if sys.platform == 'win32':
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except:
        pass

def is_admin():
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def run_as_admin():
    # 自身を管理者権限で再実行
    if getattr(sys, 'frozen', False):
        path = sys.executable
    else:
        path = sys.executable
        # スクリプト実行の場合は引数にスクリプトパスを追加
        sys.argv.insert(0, os.path.abspath(__file__))
    
    params = " ".join([f'"{a}"' for a in sys.argv[1:]])
    # 昇格実行。SW_SHOWNORMAL (1) で新しいウィンドウを表示
    ctypes.windll.shell32.ShellExecuteW(None, "runas", path, params, None, 1)

def add_to_system_path(path_to_add):
    """レジストリを直接操作してシステムPATHに追加する（安全な方法）"""
    try:
        # HKEY_LOCAL_MACHINE の Environment キーを開く
        reg_key = r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment"
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, reg_key, 0, winreg.KEY_ALL_ACCESS) as key:
            try:
                current_path, _ = winreg.QueryValueEx(key, "Path")
            except FileNotFoundError:
                current_path = ""

            # パスが既に含まれているかチェック（大文字小文字を区別せず、末尾のバックスラッシュ有無も考慮）
            normalized_path = os.path.normpath(path_to_add).lower()
            paths = [os.path.normpath(p).lower() for p in current_path.split(';') if p.strip()]
            
            if normalized_path not in paths:
                new_path = current_path.rstrip(';') + ';' + path_to_add
                winreg.SetValueEx(key, "Path", 0, winreg.REG_EXPAND_SZ, new_path)
                
                # 環境変数の変更をシステムに通知
                ctypes.windll.user32.SendMessageTimeoutW(
                    0xFFFF, 0x001A, 0, "Environment", 0x0002, 1000, ctypes.byref(ctypes.c_long())
                )
                return True, "システム環境変数 PATH に追加しました。"
            else:
                return True, "既に PATH に登録されています。"
    except Exception as e:
        return False, f"PATHの追加に失敗しました: {str(e)}"

def main():
    if not is_admin():
        print("管理者権限が必要です。昇格を確認しています...")
        run_as_admin()
        sys.exit()

    print("CoNAGIT CLI インストーラー")
    print("=" * 40)

    target_dir = r"C:\Program Files\cgit"
    exe_name = "cgit.exe"
    
    # 実行ファイルのディレクトリを取得（PyInstallerで固めた場合も考慮）
    if getattr(sys, 'frozen', False):
        current_dir = os.path.dirname(sys.executable)
    else:
        current_dir = os.path.dirname(os.path.abspath(__file__))
    
    src_path = os.path.join(current_dir, exe_name)

    # ソースとなる cgit.exe が存在するか確認
    if not os.path.exists(src_path):
        # cli/dist にある可能性も考慮（開発用）
        dist_path = os.path.join(current_dir, "dist", exe_name)
        if os.path.exists(dist_path):
            src_path = dist_path
        else:
            print(f"エラー: {exe_name} が見つかりません。")
            print(f"場所: {current_dir} に {exe_name} を置いてから実行してください。")
            input("\nEnterキーで終了...")
            sys.exit(1)

    try:
        # ディレクトリ作成
        if not os.path.exists(target_dir):
            print(f"ディレクトリ作成中: {target_dir}")
            os.makedirs(target_dir, exist_ok=True)

        # コピー
        dest_path = os.path.join(target_dir, exe_name)
        print(f"ファイルをコピー中: {dest_path}")
        shutil.copy2(src_path, dest_path)

        # PATH追加
        success, msg = add_to_system_path(target_dir)
        print(msg)

        if success:
            print("\n" + "*" * 40)
            print("インストールが成功しました！")
            print("*" * 40)
            print(f"\n場所: {target_dir}")
            print("\n使い方:")
            print("1. １度再起動してください。(今すぐではなくてもいいです)")
            print("2. 新しいコマンドプロンプトまたはPowerShellを開きます。")
            print("3. 'cgit <APIキー>' と入力して実行できるようになります。")
        else:
            print(f"\nエラーが発生しました: {msg}")

    except Exception as e:
        print(f"\n致命的なエラーが発生しました: {e}")

    input("\nEnterキーで終了...")

if __name__ == "__main__":
    main()

