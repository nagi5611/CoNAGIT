// グローバルステート
let currentUser = null;
let currentProject = null;
let currentSubproject = null;
let currentPath = '/'; // 現在のパス

// ==================== ユーティリティ関数 ====================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  // データベースから返される日時はUTCなので、明示的にUTCとして扱う
  // "2025-12-05 04:12:46" -> "2025-12-05T04:12:46Z"
  let dateStr = dateString;
  if (dateStr && !dateStr.includes('T') && !dateStr.includes('Z')) {
    dateStr = dateStr.replace(' ', 'T') + 'Z';
  }
  
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  if (hours < 24) return `${hours}時間前`;
  if (days < 7) return `${days}日前`;
  
  return date.toLocaleDateString('ja-JP', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    timeZone: 'Asia/Tokyo'
  });
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function showNotification(message, type = 'info') {
  const colors = {
    success: 'bg-green-100 border-green-500 text-green-900',
    error: 'bg-red-100 border-red-500 text-red-900',
    info: 'bg-blue-100 border-blue-500 text-blue-900'
  };
  
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 px-6 py-3 border-l-4 rounded shadow-lg ${colors[type]} z-50`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 3000);
}

// ==================== 認証機能 ====================

function showLoginPage() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg border-t-4 border-orange">
        <div class="text-center">
          <i class="fas fa-code-branch text-5xl text-orange mb-4"></i>
          <h2 class="text-3xl font-bold text-gray-900">Team Project Manager</h2>
          <p class="mt-2 text-gray-600">チームのためのプロジェクト管理ツール</p>
        </div>
        
        <div class="mt-8 space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">ユーザー名</label>
            <input id="username" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" placeholder="admin" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">パスワード</label>
            <input id="password" type="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" placeholder="password123" />
          </div>
          
          <button onclick="handleLogin()" class="w-full bg-orange text-white py-3 rounded-lg font-semibold hover:bg-orange-dark transition">
            <i class="fas fa-sign-in-alt mr-2"></i>ログイン
          </button>
          
          <div class="text-center text-sm text-gray-600">
            <p>テストアカウント: admin / password123</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function handleLogin() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  
  if (!username || !password) {
    showNotification('ユーザー名とパスワードを入力してください', 'error');
    return;
  }
  
  try {
    const response = await axios.post('/api/login', { username, password });
    if (response.data.success) {
      currentUser = response.data.user;
      localStorage.setItem('user', JSON.stringify(currentUser));
      showNotification('ログインしました', 'success');
      showProjectsPage();
    }
  } catch (error) {
    showNotification('ログインに失敗しました', 'error');
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem('user');
  showNotification('ログアウトしました', 'info');
  showLoginPage();
}

// ==================== ヘッダーコンポーネント ====================

function renderHeader() {
  return `
    <header class="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <i class="fas fa-code-branch text-2xl text-orange"></i>
          <h1 class="text-xl font-bold text-gray-900 cursor-pointer" onclick="showProjectsPage()">
            Team Project Manager
          </h1>
        </div>
        
        <div class="flex items-center space-x-4">
          <span class="text-sm text-gray-600">
            <i class="fas fa-user mr-2"></i>${currentUser.username}
          </span>
          <button onclick="logout()" class="text-sm text-gray-600 hover:text-orange">
            <i class="fas fa-sign-out-alt mr-2"></i>ログアウト
          </button>
        </div>
      </div>
    </header>
  `;
}

// ==================== プロジェクト一覧ページ ====================

async function showProjectsPage() {
  currentPath = '/';
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader()}
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-gray-900">プロジェクト一覧</h2>
        <button onclick="showCreateProjectModal()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark transition">
          <i class="fas fa-plus mr-2"></i>新規プロジェクト
        </button>
      </div>
      
      <div id="projects-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div class="text-center py-8 text-gray-500">読み込み中...</div>
      </div>
    </div>
  `;
  
  await loadProjects();
}

async function loadProjects() {
  try {
    const response = await axios.get(`/api/projects?userId=${currentUser.id}`);
    const projects = response.data;
    
    const projectsList = document.getElementById('projects-list');
    
    if (projects.length === 0) {
      projectsList.innerHTML = `
        <div class="col-span-full text-center py-12 text-gray-500">
          <i class="fas fa-folder-open text-6xl mb-4 opacity-50"></i>
          <p>プロジェクトがありません</p>
          <p class="text-sm mt-2">新規プロジェクトを作成してください</p>
        </div>
      `;
      return;
    }
    
    projectsList.innerHTML = projects.map(project => `
      <div class="bg-white border border-gray-200 rounded-lg p-6 hover:border-orange transition cursor-pointer" onclick="showProjectPage(${project.id})">
        <h3 class="text-xl font-bold text-gray-900 mb-2">${project.name}</h3>
        <p class="text-sm text-gray-600 mb-4">${project.description || '説明なし'}</p>
        
        <div class="mb-3">
          <div class="flex justify-between text-xs text-gray-600 mb-1">
            <span>進捗率</span>
            <span>${project.progress}%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div class="bg-orange h-2 rounded-full progress-bar" style="width: ${project.progress}%"></div>
          </div>
        </div>
        
        <div class="flex items-center justify-between text-xs text-gray-500 mt-4">
          <span><i class="fas fa-user mr-1"></i>${project.created_by_name}</span>
          <span><i class="fas fa-clock mr-1"></i>${formatDate(project.updated_at)}</span>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('プロジェクト取得エラー:', error);
    showNotification('プロジェクトの取得に失敗しました', 'error');
  }
}

function showCreateProjectModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-md w-full">
      <h3 class="text-2xl font-bold mb-4">新規プロジェクト作成</h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">プロジェクト名</label>
          <input id="project-name" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">説明</label>
          <textarea id="project-description" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" rows="3"></textarea>
        </div>
        
        <div class="flex space-x-3">
          <button onclick="createProject()" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition">
            作成
          </button>
          <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function createProject() {
  const name = document.getElementById('project-name').value;
  const description = document.getElementById('project-description').value;
  
  if (!name) {
    showNotification('プロジェクト名を入力してください', 'error');
    return;
  }
  
  try {
    await axios.post('/api/projects', {
      name,
      description,
      userId: currentUser.id
    });
    
    document.querySelector('.fixed').remove();
    showNotification('プロジェクトを作成しました', 'success');
    showProjectsPage();
  } catch (error) {
    showNotification('プロジェクトの作成に失敗しました', 'error');
  }
}

// ==================== プロジェクト詳細ページ ====================

async function showProjectPage(projectId) {
  currentProject = projectId;
  currentPath = '/';
  
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader()}
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div id="project-header" class="mb-8">読み込み中...</div>
      
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div class="lg:col-span-2">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold text-gray-900">子プロジェクト</h3>
            <button onclick="showCreateSubprojectModal()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark transition text-sm">
              <i class="fas fa-plus mr-2"></i>追加
            </button>
          </div>
          <div id="subprojects-list" class="space-y-4">読み込み中...</div>
        </div>
        
        <div>
          <h3 class="text-xl font-bold text-gray-900 mb-4">タイムライン</h3>
          <div id="timeline-list" class="space-y-3">読み込み中...</div>
        </div>
      </div>
    </div>
  `;
  
  await Promise.all([
    loadProjectHeader(projectId),
    loadSubprojects(projectId),
    loadTimeline(projectId)
  ]);
}

async function loadProjectHeader(projectId) {
  try {
    const response = await axios.get(`/api/projects/${projectId}`);
    const project = response.data;
    
    const header = document.getElementById('project-header');
    header.innerHTML = `
      <div class="bg-white border border-gray-200 rounded-lg p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h2 class="text-3xl font-bold text-gray-900 mb-2">${project.name}</h2>
            <p class="text-gray-600">${project.description || '説明なし'}</p>
          </div>
          <button onclick="showProjectSettings()" class="text-gray-500 hover:text-orange">
            <i class="fas fa-cog text-xl"></i>
          </button>
        </div>
        
        <div class="mb-4">
          <div class="flex justify-between text-sm text-gray-600 mb-2">
            <span>プロジェクト進捗率</span>
            <span class="font-semibold">${project.progress}%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-3">
            <div class="bg-orange h-3 rounded-full progress-bar" style="width: ${project.progress}%"></div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('プロジェクト取得エラー:', error);
  }
}

async function loadSubprojects(projectId) {
  try {
    const response = await axios.get(`/api/projects/${projectId}/subprojects`);
    const subprojects = response.data;
    
    const list = document.getElementById('subprojects-list');
    
    if (subprojects.length === 0) {
      list.innerHTML = `
        <div class="text-center py-8 text-gray-500 bg-white border border-gray-200 rounded-lg">
          <i class="fas fa-folder text-4xl mb-2 opacity-50"></i>
          <p>子プロジェクトがありません</p>
        </div>
      `;
      return;
    }
    
    list.innerHTML = subprojects.map(sub => `
      <div class="bg-white border border-gray-200 rounded-lg p-4 hover:border-orange transition">
        <div class="flex justify-between items-start">
          <div class="flex-1 cursor-pointer" onclick="showSubprojectPage(${sub.id})">
            <h4 class="font-bold text-gray-900 mb-1">${sub.name}</h4>
            <p class="text-sm text-gray-600">${sub.description || '説明なし'}</p>
          </div>
          <button onclick="downloadSubproject(${sub.id}, '${sub.name}')" class="ml-4 text-gray-500 hover:text-orange">
            <i class="fas fa-download"></i>
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('子プロジェクト取得エラー:', error);
  }
}

async function loadTimeline(projectId) {
  try {
    const response = await axios.get(`/api/projects/${projectId}/timeline`);
    const timeline = response.data;
    
    const list = document.getElementById('timeline-list');
    
    if (timeline.length === 0) {
      list.innerHTML = `
        <div class="text-center py-8 text-gray-500 bg-white border border-gray-200 rounded-lg">
          <p class="text-sm">アクティビティなし</p>
        </div>
      `;
      return;
    }
    
    list.innerHTML = timeline.map(item => {
      const iconMap = {
        created: 'fa-plus-circle text-green-500',
        updated: 'fa-edit text-blue-500',
        deleted: 'fa-trash text-red-500'
      };
      
      return `
        <div class="bg-white border border-gray-200 rounded-lg p-3 text-sm">
          <div class="flex items-start space-x-2">
            <i class="fas ${iconMap[item.action]} mt-1"></i>
            <div class="flex-1">
              <p class="text-gray-900">
                <span class="font-semibold">${item.username}</span>
                <span class="text-gray-600">${item.description}</span>
              </p>
              <p class="text-xs text-gray-500 mt-1">${formatDate(item.created_at)}</p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('タイムライン取得エラー:', error);
  }
}

function showCreateSubprojectModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-md w-full">
      <h3 class="text-2xl font-bold mb-4">子プロジェクト追加</h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">名前</label>
          <input id="subproject-name" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">説明</label>
          <textarea id="subproject-description" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" rows="3"></textarea>
        </div>
        
        <div class="flex space-x-3">
          <button onclick="createSubproject()" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition">
            追加
          </button>
          <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function createSubproject() {
  const name = document.getElementById('subproject-name').value;
  const description = document.getElementById('subproject-description').value;
  
  if (!name) {
    showNotification('名前を入力してください', 'error');
    return;
  }
  
  try {
    await axios.post(`/api/projects/${currentProject}/subprojects`, {
      name,
      description
    });
    
    document.querySelector('.fixed').remove();
    showNotification('子プロジェクトを追加しました', 'success');
    loadSubprojects(currentProject);
  } catch (error) {
    showNotification('子プロジェクトの追加に失敗しました', 'error');
  }
}

async function downloadSubproject(subprojectId, subprojectName) {
  try {
    const response = await axios.get(`/api/subprojects/${subprojectId}/files`);
    const files = response.data;
    
    if (files.length === 0) {
      showNotification('ダウンロードするファイルがありません', 'info');
      return;
    }
    
    // 簡易実装: 最初のファイルのみダウンロード
    const firstFile = files.find(f => f.file_type === 'file');
    if (firstFile) {
      const link = document.createElement('a');
      link.href = `/api/files/${firstFile.id}/download`;
      link.download = firstFile.name;
      link.click();
      
      showNotification('ファイルをダウンロードしました', 'success');
    } else {
      showNotification('ダウンロード可能なファイルがありません', 'info');
    }
  } catch (error) {
    showNotification('ダウンロードに失敗しました', 'error');
  }
}

// ==================== 子プロジェクト詳細ページ（ファイルブラウザ） ====================

async function showSubprojectPage(subprojectId) {
  currentSubproject = subprojectId;
  currentPath = '/';
  
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader()}
    <div class="max-w-7xl mx-auto px-4 py-8">
      <button onclick="showProjectPage(${currentProject})" class="text-orange mb-4 hover:underline">
        <i class="fas fa-arrow-left mr-2"></i>プロジェクトに戻る
      </button>
      
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 id="subproject-title" class="text-2xl font-bold text-gray-900">読み込み中...</h2>
          <div id="breadcrumb" class="text-sm text-gray-600 mt-2"></div>
        </div>
        <div class="flex space-x-2">
          <button onclick="showCreateFolderModal()" class="bg-white border border-orange text-orange px-4 py-2 rounded-lg hover:bg-orange hover:text-white transition">
            <i class="fas fa-folder-plus mr-2"></i>フォルダ作成
          </button>
          <button onclick="showUploadFileModal()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark transition">
            <i class="fas fa-upload mr-2"></i>ファイルアップロード
          </button>
          <button onclick="showCreateFileModal()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark transition">
            <i class="fas fa-plus mr-2"></i>ファイル作成
          </button>
        </div>
      </div>
      
      <div class="bg-white border border-gray-200 rounded-lg">
        <div id="files-list">読み込み中...</div>
      </div>
    </div>
  `;
  
  await loadFiles(subprojectId, currentPath);
}

async function loadFiles(subprojectId, path = '/') {
  currentPath = path;
  
  try {
    const response = await axios.get(`/api/subprojects/${subprojectId}/files?path=${encodeURIComponent(path)}`);
    const files = response.data;
    
    // パンくずリスト更新
    updateBreadcrumb(path);
    
    const list = document.getElementById('files-list');
    
    let html = '';
    
    // 親ディレクトリへ戻るリンク
    if (path !== '/') {
      const parentPath = path.split('/').slice(0, -1).join('/') || '/';
      html += `
        <div class="flex items-center p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-200" onclick="loadFiles(${subprojectId}, '${parentPath}')">
          <i class="fas fa-level-up-alt text-gray-400 text-xl mr-4"></i>
          <div class="flex-1">
            <h4 class="font-semibold text-gray-900">..</h4>
          </div>
        </div>
      `;
    }
    
    if (files.length === 0 && path === '/') {
      list.innerHTML = `
        <div class="text-center py-12 text-gray-500">
          <i class="fas fa-file text-6xl mb-4 opacity-50"></i>
          <p>ファイルがありません</p>
          <p class="text-sm mt-2">ファイルまたはフォルダを追加してください</p>
        </div>
      `;
      return;
    }
    
    html += files.map((file, index) => {
      const isFolder = file.file_type === 'folder';
      const icon = isFolder ? 'fa-folder text-yellow-500' : 'fa-file-alt text-gray-400';
      const nextPath = isFolder ? `${path === '/' ? '' : path}/${file.name}` : null;
      
      // HTMLエスケープ処理
      const escapedFileName = escapeHtml(file.name);
      const escapedPath = nextPath ? escapeHtml(nextPath) : '';
      
      return `
        <div class="flex items-center justify-between p-4 hover:bg-gray-50 ${index > 0 || path !== '/' ? 'border-t border-gray-200' : ''}">
          <div class="flex items-center flex-1 ${isFolder ? 'cursor-pointer' : 'cursor-pointer'}" onclick="${isFolder ? `loadFiles(${subprojectId}, '${escapedPath}')` : `loadAndShowFileEditor(${file.id})`}">
            <i class="fas ${icon} text-xl mr-4"></i>
            <div class="flex-1">
              <h4 class="font-semibold text-gray-900">${escapedFileName}</h4>
              <p class="text-sm text-gray-600">
                <i class="fas fa-user mr-1"></i>${file.updated_by_name}
                <span class="mx-2">•</span>
                <i class="fas fa-clock mr-1"></i>${formatDate(file.updated_at)}
                ${!isFolder && file.file_size ? `<span class="mx-2">•</span>${formatFileSize(file.file_size)}` : ''}
              </p>
            </div>
          </div>
          
          <div class="flex items-center space-x-2">
            ${!isFolder ? `
              <button onclick="event.stopPropagation(); downloadFile(${file.id}, '${escapedFileName}')" class="text-gray-500 hover:text-orange p-2">
                <i class="fas fa-download"></i>
              </button>
            ` : ''}
            <button onclick="event.stopPropagation(); deleteFile(${file.id}, '${escapedFileName}', ${isFolder})" class="text-gray-500 hover:text-red-500 p-2">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
    
    list.innerHTML = html;
  } catch (error) {
    console.error('ファイル取得エラー:', error);
  }
}

function updateBreadcrumb(path) {
  const breadcrumb = document.getElementById('breadcrumb');
  const parts = path.split('/').filter(p => p);
  
  let html = '<i class="fas fa-folder-open mr-2"></i>';
  html += `<span class="cursor-pointer hover:text-orange" onclick="loadFiles(${currentSubproject}, '/')">ルート</span>`;
  
  let currentPath = '';
  parts.forEach((part, index) => {
    currentPath += '/' + part;
    html += ' / ';
    if (index === parts.length - 1) {
      html += `<span class="font-semibold">${part}</span>`;
    } else {
      html += `<span class="cursor-pointer hover:text-orange" onclick="loadFiles(${currentSubproject}, '${currentPath}')">${part}</span>`;
    }
  });
  
  breadcrumb.innerHTML = html;
}

// ==================== フォルダ作成 ====================

function showCreateFolderModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-md w-full">
      <h3 class="text-2xl font-bold mb-4">フォルダ作成</h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">フォルダ名</label>
          <input id="folder-name" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" placeholder="新しいフォルダ" />
        </div>
        
        <div class="flex space-x-3">
          <button onclick="createFolder()" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition">
            作成
          </button>
          <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function createFolder() {
  const name = document.getElementById('folder-name').value;
  
  if (!name) {
    showNotification('フォルダ名を入力してください', 'error');
    return;
  }
  
  try {
    await axios.post(`/api/subprojects/${currentSubproject}/folders`, {
      name,
      path: currentPath,
      userId: currentUser.id,
      projectId: currentProject
    });
    
    document.querySelector('.fixed').remove();
    showNotification('フォルダを作成しました', 'success');
    loadFiles(currentSubproject, currentPath);
    loadTimeline(currentProject);
  } catch (error) {
    showNotification('フォルダの作成に失敗しました', 'error');
  }
}

// ==================== ファイルアップロード ====================

function showUploadFileModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-2xl w-full">
      <h3 class="text-2xl font-bold mb-4">ファイルアップロード</h3>
      
      <div class="space-y-4">
        <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <input type="file" id="file-upload" multiple webkitdirectory="" directory="" class="hidden" onchange="handleFileSelect(event)" />
          <input type="file" id="file-upload-normal" multiple class="hidden" onchange="handleFileSelect(event)" />
          
          <i class="fas fa-cloud-upload-alt text-6xl text-gray-400 mb-4"></i>
          <p class="text-gray-600 mb-4">ファイルをアップロード</p>
          
          <div class="flex justify-center space-x-3">
            <button onclick="document.getElementById('file-upload-normal').click()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark transition">
              <i class="fas fa-file mr-2"></i>ファイルを選択
            </button>
            <button onclick="document.getElementById('file-upload').click()" class="bg-white border border-orange text-orange px-4 py-2 rounded-lg hover:bg-orange hover:text-white transition">
              <i class="fas fa-folder mr-2"></i>フォルダを選択
            </button>
          </div>
        </div>
        
        <div id="upload-preview" class="space-y-2 max-h-60 overflow-y-auto"></div>
        
        <div class="flex space-x-3">
          <button id="upload-btn" onclick="uploadFiles()" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition" disabled>
            アップロード
          </button>
          <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

let selectedFiles = [];

function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  selectedFiles = files;
  
  const preview = document.getElementById('upload-preview');
  const uploadBtn = document.getElementById('upload-btn');
  
  if (files.length === 0) {
    preview.innerHTML = '';
    uploadBtn.disabled = true;
    return;
  }
  
  uploadBtn.disabled = false;
  
  preview.innerHTML = `
    <div class="text-sm text-gray-600 mb-2">
      <i class="fas fa-info-circle mr-2"></i>${files.length}個のファイルが選択されています
    </div>
    ${files.slice(0, 10).map(file => `
      <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
        <span class="text-sm truncate flex-1">${file.webkitRelativePath || file.name}</span>
        <span class="text-xs text-gray-500 ml-2">${formatFileSize(file.size)}</span>
      </div>
    `).join('')}
    ${files.length > 10 ? `<div class="text-sm text-gray-500 text-center">他 ${files.length - 10} 個のファイル...</div>` : ''}
  `;
}

async function uploadFiles() {
  if (selectedFiles.length === 0) {
    showNotification('ファイルを選択してください', 'error');
    return;
  }
  
  const uploadBtn = document.getElementById('upload-btn');
  uploadBtn.disabled = true;
  uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>アップロード中...';
  
  try {
    const filesData = [];
    
    for (const file of selectedFiles) {
      const content = await readFileAsText(file);
      const relativePath = file.webkitRelativePath || file.name;
      const pathParts = relativePath.split('/');
      const fileName = pathParts.pop();
      const filePath = currentPath === '/' ? 
        (pathParts.length > 0 ? '/' + pathParts.join('/') : '/') :
        (pathParts.length > 0 ? currentPath + '/' + pathParts.join('/') : currentPath);
      
      filesData.push({
        name: fileName,
        content: content,
        path: filePath,
        mimeType: file.type || 'text/plain',
        fileSize: file.size
      });
    }
    
    await axios.post(`/api/subprojects/${currentSubproject}/files/batch`, {
      files: filesData,
      userId: currentUser.id,
      projectId: currentProject
    });
    
    document.querySelector('.fixed').remove();
    showNotification(`${filesData.length}個のファイルをアップロードしました`, 'success');
    loadFiles(currentSubproject, currentPath);
    loadTimeline(currentProject);
  } catch (error) {
    console.error('アップロードエラー:', error);
    showNotification('ファイルのアップロードに失敗しました', 'error');
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = 'アップロード';
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    
    // テキストファイルとして読み取り
    if (file.type.startsWith('text/') || file.type === '' || file.name.match(/\.(txt|js|json|html|css|md|py|java|cpp|c|h)$/i)) {
      reader.readAsText(file);
    } else {
      // バイナリファイルの場合はBase64エンコード
      reader.readAsDataURL(file);
    }
  });
}

// ==================== ファイル作成 ====================

function showCreateFileModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-2xl w-full">
      <h3 class="text-2xl font-bold mb-4">ファイル作成</h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">ファイル名</label>
          <input id="file-name" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" placeholder="example.txt" />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">内容</label>
          <textarea id="file-content" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange font-mono text-sm" rows="10"></textarea>
        </div>
        
        <div class="flex space-x-3">
          <button onclick="createFile()" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition">
            作成
          </button>
          <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
            キャンセル
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function createFile() {
  const name = document.getElementById('file-name').value;
  const content = document.getElementById('file-content').value;
  
  if (!name) {
    showNotification('ファイル名を入力してください', 'error');
    return;
  }
  
  try {
    await axios.post(`/api/subprojects/${currentSubproject}/files`, {
      name,
      content,
      path: currentPath,
      userId: currentUser.id,
      projectId: currentProject,
      mimeType: 'text/plain',
      fileSize: new Blob([content]).size
    });
    
    document.querySelector('.fixed').remove();
    showNotification('ファイルを作成しました', 'success');
    loadFiles(currentSubproject, currentPath);
    loadTimeline(currentProject);
  } catch (error) {
    showNotification('ファイルの作成に失敗しました', 'error');
  }
}

// ==================== ファイル編集 ====================

// サーバーからファイルを取得して表示
async function loadAndShowFileEditor(fileId) {
  try {
    const response = await axios.get(`/api/files/${fileId}/download`);
    const fileContent = response.data;
    
    // ファイル情報を取得するために別途リクエスト
    const fileInfoResponse = await axios.get(`/api/subprojects/${currentSubproject}/files?path=${encodeURIComponent(currentPath)}`);
    const file = fileInfoResponse.data.find(f => f.id === fileId);
    
    if (file) {
      showFileEditor(fileId, file.name, fileContent, file.mime_type || 'text/plain');
    }
  } catch (error) {
    console.error('ファイル読み込みエラー:', error);
    showNotification('ファイルの読み込みに失敗しました', 'error');
  }
}

function showFileEditor(fileId, fileName, fileContent, mimeType) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  
  const escapedFileName = escapeHtml(fileName);
  const escapedContent = escapeHtml(fileContent);
  
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <h3 class="text-2xl font-bold mb-4">${escapedFileName}</h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">内容</label>
          <textarea id="edit-file-content" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange font-mono text-sm" rows="15"></textarea>
        </div>
        
        <div class="flex space-x-3">
          <button onclick="updateFile(${fileId})" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition">
            保存
          </button>
          <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
            閉じる
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // コンテンツをtextContentで設定（HTMLエスケープ不要）
  document.getElementById('edit-file-content').value = fileContent;
  
  // ファイル名をグローバルに保存
  window.currentEditingFileName = fileName;
}

async function updateFile(fileId) {
  const content = document.getElementById('edit-file-content').value;
  const fileName = window.currentEditingFileName;
  
  try {
    await axios.put(`/api/files/${fileId}`, {
      name: fileName,
      content,
      userId: currentUser.id,
      projectId: currentProject
    });
    
    document.querySelector('.fixed').remove();
    showNotification('ファイルを更新しました', 'success');
    loadFiles(currentSubproject, currentPath);
    loadTimeline(currentProject);
  } catch (error) {
    showNotification('ファイルの更新に失敗しました', 'error');
  }
}

async function downloadFile(fileId, fileName) {
  const link = document.createElement('a');
  link.href = `/api/files/${fileId}/download`;
  link.download = fileName;
  link.click();
  
  showNotification('ファイルをダウンロードしました', 'success');
}

async function deleteFile(fileId, fileName, isFolder) {
  const itemType = isFolder ? 'フォルダ' : 'ファイル';
  if (!confirm(`${fileName} ${itemType}を削除しますか?`)) {
    return;
  }
  
  try {
    await axios.delete(`/api/files/${fileId}`, {
      data: {
        userId: currentUser.id,
        projectId: currentProject,
        fileName
      }
    });
    
    showNotification(`${itemType}を削除しました`, 'success');
    loadFiles(currentSubproject, currentPath);
    loadTimeline(currentProject);
  } catch (error) {
    showNotification(`${itemType}の削除に失敗しました`, 'error');
  }
}

// ==================== 初期化 ====================

window.addEventListener('DOMContentLoaded', () => {
  const savedUser = localStorage.getItem('user');
  if (savedUser) {
    currentUser = JSON.parse(savedUser);
    showProjectsPage();
  } else {
    showLoginPage();
  }
});
