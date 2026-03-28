// Extract token from URL
const pathParts = window.location.pathname.split('/');
const token = pathParts[pathParts.length - 1];
let fileInfo = null;

async function loadSharePage() {
  try {
    const response = await axios.get(`/api/share/${token}`);
    fileInfo = response.data;

    // ファイルタイプを判定
    const fileType = getFileType(fileInfo);
    const MAX_PREVIEW_SIZE = 50 * 1024 * 1024; // 50MB
    const isTooLarge = fileInfo.fileSize > MAX_PREVIEW_SIZE;
    const canPreview = ['image', 'video', '3d', 'text', 'pdf'].includes(fileType) && !isTooLarge;

    // パス情報を整形
    const pathDisplay = fileInfo.filePath === '/' ? '' : fileInfo.filePath;
    const fullPath = pathDisplay ? `${pathDisplay}/${fileInfo.fileName}` : fileInfo.fileName;

    document.getElementById('app').innerHTML = `
      <div class="min-h-screen bg-gray-50 py-8 px-4">
        <div class="max-w-4xl mx-auto">
          <!-- ヘッダー -->
          <div class="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div class="flex items-center mb-4">
              <i class="fas fa-share-alt text-blue-500 text-3xl mr-3"></i>
              <h1 class="text-2xl font-bold text-gray-900">共有ファイル</h1>
            </div>
            
            <!-- プロジェクト情報 -->
            <div class="bg-gray-50 rounded-lg p-4 mb-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <span class="text-gray-500">プロジェクト:</span>
                  <span class="ml-2 font-semibold text-gray-900">${escapeHtml(fileInfo.projectName)}</span>
                </div>
                <div>
                  <span class="text-gray-500">子プロジェクト:</span>
                  <span class="ml-2 font-semibold text-gray-900">${escapeHtml(fileInfo.subprojectName)}</span>
                </div>
                <div class="md:col-span-2">
                  <span class="text-gray-500">パス:</span>
                  <span class="ml-2 font-mono text-sm text-gray-700">${escapeHtml(fullPath)}</span>
                </div>
              </div>
            </div>
            
            <!-- ファイル情報 -->
            <div class="flex items-center justify-between">
              <div class="flex items-center">
                ${getFileIcon(fileType)}
                <div class="ml-3">
                  <h2 class="text-lg font-semibold text-gray-900">${escapeHtml(fileInfo.fileName)}</h2>
                  <p class="text-sm text-gray-600">
                    ${formatFileSize(fileInfo.fileSize)} · 
                    共有者: ${escapeHtml(fileInfo.creatorName)}
                  </p>
                </div>
              </div>
            </div>
          </div>
          

          
          <!-- プレビュー/ダウンロードエリア -->
          <div class="bg-white rounded-lg shadow-lg p-6">
            ${fileInfo.isLimitExceeded ? `
              <div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
                <h3 class="font-bold flex items-center mb-2">
                  <i class="fas fa-exclamation-circle mr-2 text-xl"></i>ダウンロード上限に達しました
                </h3>
                <p class="text-sm">この共有リンクはダウンロード回数の上限（${fileInfo.maxDownloads}回）に達したため、これ以上ダウンロードできません。</p>
              </div>
            ` : ''}

            ${!fileInfo.isLimitExceeded && isTooLarge && ['image', 'video', '3d', 'text', 'pdf'].includes(fileType) ? `
              <div class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
                <div class="flex items-center">
                  <i class="fas fa-info-circle mr-2 text-xl"></i>
                  <p class="text-sm">ファイルサイズが大きいため（50MB超）、プレビューを表示できません。ダウンロードして確認してください。</p>
                </div>
              </div>
            ` : ''}

            ${canPreview && !fileInfo.isLimitExceeded ? `
              <div class="mb-4">
                <div class="flex justify-between items-center mb-3">
                  <h3 class="text-lg font-semibold text-gray-900">プレビュー</h3>
                  <button onclick="togglePreview()" id="preview-toggle" class="text-blue-600 hover:text-blue-800 text-sm">
                    <i class="fas fa-eye mr-1"></i>表示
                  </button>
                </div>
                <div id="preview-container" class="hidden border border-gray-200 rounded-lg overflow-hidden">
                  <div class="flex items-center justify-center py-8">
                    <i class="fas fa-spinner fa-spin text-3xl text-gray-400"></i>
                  </div>
                </div>
              </div>
            ` : ''}
            
            <button onclick="downloadFile()" 
              ${fileInfo.isLimitExceeded ? 'disabled' : ''}
              class="w-full bg-blue-500 text-white py-3 px-6 rounded-lg transition flex items-center justify-center text-lg font-semibold ${fileInfo.isLimitExceeded ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'}">
              <i class="fas fa-download mr-2"></i>ダウンロード
            </button>
            
            <div class="mt-4 text-center">
              <p class="text-xs text-gray-500">
                <i class="fas fa-info-circle mr-1"></i>
                このファイルは CoNAGIT から共有されています
              </p>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Share page error:', error);
    const errorMessage = error.response?.data?.error || 'このリンクは無効または期限切れです';
    document.getElementById('app').innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-4">
        <div class="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <i class="fas fa-exclamation-triangle text-6xl text-red-500 mb-4"></i>
          <h1 class="text-2xl font-bold text-gray-900 mb-2">エラー</h1>
          <p class="text-gray-600">${escapeHtml(errorMessage)}</p>
        </div>
      </div>
    `;
  }
}

async function togglePreview() {
  const container = document.getElementById('preview-container');
  const toggle = document.getElementById('preview-toggle');

  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    toggle.innerHTML = '<i class="fas fa-eye-slash mr-1"></i>非表示';
    await loadPreview();
  } else {
    container.classList.add('hidden');
    toggle.innerHTML = '<i class="fas fa-eye mr-1"></i>表示';
  }
}

async function loadPreview() {
  const container = document.getElementById('preview-container');
  const fileType = getFileType(fileInfo);

  try {
    const response = await axios.get(`/api/share/${token}/preview`);
    const previewUrl = response.data.previewUrl;

    if (fileType === 'image') {
      container.innerHTML = `
        <img src="${previewUrl}" alt="${escapeHtml(fileInfo.fileName)}" 
          class="w-full h-auto max-h-[600px] object-contain">
      `;
    } else if (fileType === 'video') {
      container.innerHTML = `
        <video src="${previewUrl}" controls class="w-full max-h-[600px]">
          お使いのブラウザは動画タグをサポートしていません。
        </video>
      `;
    } else if (fileType === '3d') {
      container.innerHTML = `
        <div id="threejs-viewer" class="w-full h-[500px] bg-gray-900 relative">
          <div class="absolute inset-0 flex items-center justify-center text-white">
            <i class="fas fa-cube text-4xl animate-spin"></i>
          </div>
        </div>
        <p class="text-xs text-gray-500 text-center mt-2">
          マウスでドラッグ: 回転 | ホイール: ズーム | 右クリック: パン
        </p>
      `;
      await load3DModel(previewUrl, fileInfo.fileName);
    } else if (fileType === 'text') {
      const textResponse = await axios.get(previewUrl);
      const text = typeof textResponse.data === 'string' ? textResponse.data : JSON.stringify(textResponse.data, null, 2);
      container.innerHTML = `
        <pre class="p-4 bg-gray-50 text-sm overflow-auto max-h-[500px] font-mono">${escapeHtml(text)}</pre>
      `;
    } else if (fileType === 'pdf') {
      container.innerHTML = `
        <iframe src="${previewUrl}" class="w-full h-[600px] border-0"></iframe>
      `;
    }
  } catch (error) {
    console.error('Preview error:', error);
    container.innerHTML = `
      <div class="p-8 text-center text-red-500">
        <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
        <p>プレビューの読み込みに失敗しました</p>
      </div>
    `;
  }
}

async function load3DModel(url, fileName) {
  const container = document.getElementById('threejs-viewer');
  if (!container) return;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);

  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight1.position.set(1, 1, 1);
  scene.add(directionalLight1);

  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
  directionalLight2.position.set(-1, -1, -1);
  scene.add(directionalLight2);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const fileExt = fileName.toLowerCase().split('.').pop();

  try {
    let model;

    if (fileExt === 'stl') {
      const loader = new THREE.STLLoader();
      const geometry = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      const material = new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        specular: 0x111111,
        shininess: 200
      });
      model = new THREE.Mesh(geometry, material);
      scene.add(model);
    } else if (fileExt === 'glb' || fileExt === 'gltf') {
      const loader = new THREE.GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      model = gltf.scene;
      scene.add(model);
    } else if (fileExt === 'obj') {
      const loader = new THREE.OBJLoader();
      model = await new Promise((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      model.traverse((child) => {
        if (child.isMesh && !child.material) {
          child.material = new THREE.MeshPhongMaterial({
            color: 0xcccccc,
            specular: 0x111111,
            shininess: 200
          });
        }
      });
      scene.add(model);
    }

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    model.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5;

    camera.position.set(cameraZ, cameraZ, cameraZ);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
  } catch (error) {
    console.error('3D model load error:', error);
    container.innerHTML = `
      <div class="absolute inset-0 flex items-center justify-center text-red-400">
        <div class="text-center">
          <i class="fas fa-exclamation-triangle text-4xl mb-2"></i>
          <p>3Dモデルの読み込みに失敗しました</p>
        </div>
      </div>
    `;
  }
}

async function downloadFile() {
  const btn = event.target.closest('button');
  const originalHTML = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>ダウンロード中...';

    const response = await axios.get(`/api/share/${token}/download`);

    window.location.href = response.data.downloadUrl;

    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check mr-2"></i>ダウンロード完了';

      setTimeout(() => {
        btn.innerHTML = originalHTML;
      }, 2000);
    }, 1000);
  } catch (error) {
    console.error('Download error:', error);
    alert('ダウンロードに失敗しました');
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
}

function getFileType(fileInfo) {
  const ext = fileInfo.fileName.toLowerCase().split('.').pop();
  const mime = fileInfo.mimeType || '';

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (['glb', 'gltf', 'stl', 'obj'].includes(ext)) return '3d';
  if (mime.startsWith('text/') || ['txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'py', 'java', 'cpp', 'c', 'h'].includes(ext)) return 'text';

  return 'other';
}

function getFileIcon(fileType) {
  const icons = {
    'image': '<i class="fas fa-image text-blue-500 text-4xl"></i>',
    'video': '<i class="fas fa-video text-purple-500 text-4xl"></i>',
    '3d': '<i class="fas fa-cube text-green-500 text-4xl"></i>',
    'text': '<i class="fas fa-file-alt text-gray-500 text-4xl"></i>',
    'pdf': '<i class="fas fa-file-pdf text-red-500 text-4xl"></i>',
    'other': '<i class="fas fa-file text-gray-400 text-4xl"></i>'
  };
  return icons[fileType] || icons['other'];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Load the page
loadSharePage();
