// グローバルステート
let currentUser = null;
let currentProject = null;
let currentProjectName = null;
let currentSubproject = null;
let currentSubprojectName = null;
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
          <h2 class="text-3xl font-bold text-gray-900">CoNAGIT</h2>
          <p class="mt-2 text-gray-600">チームのためのプロジェクト管理ツール</p>
        </div>
        
        <div class="mt-8 space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">ユーザー名</label>
            <input id="username" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" />
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">パスワード</label>
            <input id="password" type="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" />
          </div>
          
          <button onclick="handleLogin()" class="w-full bg-orange text-white py-3 rounded-lg font-semibold hover:bg-orange-dark transition">
            <i class="fas fa-sign-in-alt mr-2"></i>ログイン
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Enterキーイベントリスナーを追加
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  
  // ユーザー名欄でEnterキーを押したらパスワード欄にフォーカス
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      passwordInput.focus();
    }
  });
  
  // パスワード欄でEnterキーを押したらログイン処理
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLogin();
    }
  });
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

// ==================== アカウント設定 ====================

function showAccountSettingsModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-md w-full">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-2xl font-bold">アカウント設定</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">ユーザー名</label>
          <input type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100" value="${escapeHtml(currentUser.username)}" disabled />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">メールアドレス</label>
          <input type="email" class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100" value="${escapeHtml(currentUser.email || '')}" disabled />
        </div>
        
        <div class="border-t border-gray-200 pt-4 mt-4">
          <h4 class="text-lg font-semibold mb-3">パスワード変更</h4>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">現在のパスワード</label>
              <input id="current-password" type="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">新しいパスワード</label>
              <input id="new-password-change" type="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">新しいパスワード（確認）</label>
              <input id="new-password-confirm" type="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" />
            </div>
            
            <button onclick="updatePassword()" class="w-full bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition">
              パスワードを変更
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

async function updatePassword() {
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password-change').value;
  const newPasswordConfirm = document.getElementById('new-password-confirm').value;
  
  if (!currentPassword || !newPassword || !newPasswordConfirm) {
    showNotification('すべての項目を入力してください', 'error');
    return;
  }
  
  if (newPassword !== newPasswordConfirm) {
    showNotification('新しいパスワードが一致しません', 'error');
    return;
  }
  
  if (newPassword.length < 3) {
    showNotification('パスワードは3文字以上で入力してください', 'error');
    return;
  }
  
  try {
    await axios.put(`/api/users/${currentUser.id}/password`, {
      currentPassword,
      newPassword,
      userId: currentUser.id
    });
    
    document.querySelector('.fixed').remove();
    showNotification('パスワードを変更しました', 'success');
  } catch (error) {
    console.error('パスワード変更エラー:', error);
    if (error.response && error.response.status === 401) {
      showNotification('現在のパスワードが正しくありません', 'error');
    } else if (error.response && error.response.status === 403) {
      showNotification('パスワード変更権限がありません', 'error');
    } else {
      showNotification('パスワードの変更に失敗しました', 'error');
    }
  }
}

// ==================== ヘッダーコンポーネント ====================

function renderHeader() {
  return `
    <header class="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <i class="fas fa-code-branch text-2xl text-orange"></i>
          <h1 class="text-xl font-bold text-gray-900 cursor-pointer" onclick="showProjectsPage()">
            CoNAGIT
          </h1>
        </div>
        
        <div class="flex items-center space-x-4">
          <button onclick="showAccountSettingsModal()" class="text-sm text-gray-600 hover:text-orange cursor-pointer">
            <i class="fas fa-user mr-2"></i>${currentUser.username}
          </button>
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
  currentProject = null;
  currentProjectName = null;
  currentSubproject = null;
  currentSubprojectName = null;
  currentPath = '/';
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader()}
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-gray-900">プロジェクト一覧</h2>
        <div class="flex space-x-2">
          ${currentUser.username === 'admin' ? `
          <button onclick="showMemberManagementModal()" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition">
            <i class="fas fa-users mr-2"></i>メンバー管理
          </button>
          ` : ''}
          <button onclick="showCreateProjectModal()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark transition">
            <i class="fas fa-plus mr-2"></i>新規プロジェクト
          </button>
        </div>
      </div>
      
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div class="lg:col-span-3">
          <div id="projects-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div class="text-center py-8 text-gray-500">読み込み中...</div>
          </div>
        </div>
        
        <div class="lg:col-span-1">
          <h3 class="text-xl font-bold text-gray-900 mb-4">最近の変更</h3>
          <div id="recent-timeline" class="space-y-3">
            <div class="text-center py-8 text-gray-500 text-sm">読み込み中...</div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  await Promise.all([
    loadProjects(),
    loadRecentTimeline()
  ]);
}

async function loadProjects() {
  try {
    const response = await axios.get(`/api/projects`);
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

async function loadRecentTimeline() {
  try {
    const response = await axios.get('/api/timeline/recent?limit=5');
    const timeline = response.data;
    
    const timelineList = document.getElementById('recent-timeline');
    
    if (timeline.length === 0) {
      timelineList.innerHTML = `
        <div class="text-center py-8 text-gray-500 bg-white border border-gray-200 rounded-lg">
          <p class="text-sm">アクティビティなし</p>
        </div>
      `;
      return;
    }
    
    timelineList.innerHTML = timeline.map(item => {
      const iconMap = {
        created: 'fa-plus-circle text-green-500',
        updated: 'fa-edit text-blue-500',
        deleted: 'fa-trash text-red-500'
      };
      
      return `
        <div class="bg-white border border-gray-200 rounded-lg p-3 text-sm cursor-pointer hover:border-orange transition" onclick="showProjectPage(${item.project_id})">
          <div class="flex items-start space-x-2">
            <i class="fas ${iconMap[item.action]} mt-1"></i>
            <div class="flex-1">
              <p class="text-gray-900">
                <span class="font-semibold">${item.username}</span>
                <span class="text-gray-600">${item.description}</span>
              </p>
              <p class="text-xs text-gray-500 mt-1">
                <span class="text-orange font-medium">${item.project_name}</span>
                <span class="mx-1">•</span>
                ${formatDate(item.created_at)}
              </p>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('最近のタイムライン取得エラー:', error);
    const timelineList = document.getElementById('recent-timeline');
    if (timelineList) {
      timelineList.innerHTML = `
        <div class="text-center py-8 text-gray-500 bg-white border border-gray-200 rounded-lg">
          <p class="text-sm text-red-500">読み込みエラー</p>
        </div>
      `;
    }
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

// ==================== メンバー管理 ====================

function showMemberManagementModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-2xl font-bold">メンバー管理</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times text-xl"></i>
        </button>
      </div>
      
      <div class="space-y-6">
        <!-- ユーザー追加セクション -->
        <div class="border-b border-gray-200 pb-4">
          <h4 class="text-lg font-semibold mb-3">ユーザー追加</h4>
          <div class="flex space-x-2">
            <input id="user-search-input" type="text" 
              class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" 
              placeholder="ユーザー名またはメールアドレスで検索..."
              oninput="searchUsers(event.target.value)" />
            <button onclick="showCreateUserModal()" class="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition">
              <i class="fas fa-user-plus mr-2"></i>新規作成
            </button>
          </div>
          <div id="user-search-results" class="mt-2 space-y-2 max-h-40 overflow-y-auto"></div>
        </div>
        
        <!-- ユーザー一覧セクション -->
        <div>
          <h4 class="text-lg font-semibold mb-3">登録済みユーザー</h4>
          <div id="users-list" class="space-y-2">読み込み中...</div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  loadUsers();
}

let userSearchTimeout = null;

async function searchUsers(query) {
  if (!query || query.length < 1) {
    document.getElementById('user-search-results').innerHTML = '';
    return;
  }
  
  clearTimeout(userSearchTimeout);
  userSearchTimeout = setTimeout(async () => {
    try {
      const response = await axios.get(`/api/users/search?q=${encodeURIComponent(query)}`);
      const users = response.data;
      
      const resultsDiv = document.getElementById('user-search-results');
      if (users.length === 0) {
        resultsDiv.innerHTML = '<p class="text-sm text-gray-500">ユーザーが見つかりません</p>';
        return;
      }
      
      resultsDiv.innerHTML = users.map(user => `
        <div class="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100">
          <div>
            <p class="font-semibold text-gray-900">${escapeHtml(user.username)}</p>
            <p class="text-sm text-gray-600">${escapeHtml(user.email)}</p>
          </div>
          <button onclick="createUser('${escapeHtml(user.username)}', ${user.id})" class="text-orange hover:text-orange-dark">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      `).join('');
    } catch (error) {
      console.error('ユーザー検索エラー:', error);
    }
  }, 300);
}

async function loadUsers() {
  try {
    const response = await axios.get('/api/users');
    const users = response.data;
    
    const list = document.getElementById('users-list');
    
    if (users.length === 0) {
      list.innerHTML = '<p class="text-gray-500">ユーザーがありません</p>';
      return;
    }
    
    list.innerHTML = users.map(user => `
      <div class="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100">
        <div>
          <p class="font-semibold text-gray-900">${escapeHtml(user.username)}</p>
          <p class="text-sm text-gray-600">${escapeHtml(user.email)}</p>
        </div>
        ${user.id !== currentUser.id ? `
        <button onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')" class="text-red-500 hover:text-red-600">
          <i class="fas fa-trash"></i>
        </button>
        ` : '<span class="text-sm text-gray-400">現在のユーザー</span>'}
      </div>
    `).join('');
  } catch (error) {
    console.error('ユーザー取得エラー:', error);
    showNotification('ユーザーの取得に失敗しました', 'error');
  }
}

function showCreateUserModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-md w-full">
      <h3 class="text-2xl font-bold mb-4">新規ユーザー作成</h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">ユーザー名</label>
          <input id="new-username" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">メールアドレス</label>
          <input id="new-email" type="email" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" />
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">パスワード</label>
          <input id="new-password" type="password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" />
        </div>
        
        <div class="flex space-x-3">
          <button onclick="createUserFromForm()" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition">
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

async function createUserFromForm() {
  const username = document.getElementById('new-username').value;
  const email = document.getElementById('new-email').value;
  const password = document.getElementById('new-password').value;
  
  if (!username || !email || !password) {
    showNotification('すべての項目を入力してください', 'error');
    return;
  }
  
  try {
    await axios.post('/api/register', {
      username,
      email,
      password
    });
    
    document.querySelector('.fixed').remove();
    showNotification('ユーザーを作成しました', 'success');
    loadUsers();
  } catch (error) {
    console.error('ユーザー作成エラー:', error);
    showNotification('ユーザーの作成に失敗しました', 'error');
  }
}

async function createUser(username, userId) {
  // この関数は検索結果からユーザーを追加する際に使用（現在は未使用）
  // 将来的にプロジェクトメンバーとして追加する機能に使用可能
  showNotification('ユーザーは既に登録されています', 'info');
}

async function deleteUser(userId, username) {
  if (!confirm(`ユーザー「${username}」を削除しますか？この操作は取り消せません。`)) {
    return;
  }
  
  try {
    await axios.delete(`/api/users/${userId}`, {
      data: { adminUserId: currentUser.id }
    });
    
    showNotification('ユーザーを削除しました', 'success');
    loadUsers();
  } catch (error) {
    console.error('ユーザー削除エラー:', error);
    if (error.response && error.response.status === 403) {
      showNotification('削除権限がありません', 'error');
    } else if (error.response && error.response.status === 400) {
      showNotification(error.response.data.error || '削除できません', 'error');
    } else {
      showNotification('ユーザーの削除に失敗しました', 'error');
    }
  }
}

// ==================== プロジェクト詳細ページ ====================

async function showProjectPage(projectId) {
  currentProject = projectId;
  currentSubproject = null;
  currentSubprojectName = null;
  currentPath = '/';
  
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader()}
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div id="project-breadcrumb" class="mb-4 text-sm text-gray-600">読み込み中...</div>
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
    
    // プロジェクト名を保存
    currentProjectName = project.name;
    
    // パンくずリストを更新
    updateProjectBreadcrumb();
    
    const header = document.getElementById('project-header');
    header.innerHTML = `
      <div class="bg-white border border-gray-200 rounded-lg p-6">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h2 class="text-3xl font-bold text-gray-900 mb-2">${project.name}</h2>
            <p class="text-gray-600">${project.description || '説明なし'}</p>
          </div>
          <button onclick="showProjectSettings(${projectId})" class="text-gray-500 hover:text-orange">
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

function updateProjectBreadcrumb() {
  const breadcrumb = document.getElementById('project-breadcrumb');
  if (!breadcrumb) return;
  
  let html = '<i class="fas fa-home mr-2"></i>';
  html += `<span class="cursor-pointer hover:text-orange" onclick="showProjectsPage()">プロジェクト一覧</span>`;
  
  if (currentProjectName) {
    html += ' / ';
    if (currentSubprojectName) {
      html += `<span class="cursor-pointer hover:text-orange" onclick="showProjectPage(${currentProject})">${escapeHtml(currentProjectName)}</span>`;
      html += ' / ';
      html += `<span class="font-semibold">${escapeHtml(currentSubprojectName)}</span>`;
    } else {
      html += `<span class="font-semibold">${escapeHtml(currentProjectName)}</span>`;
    }
  }
  
  breadcrumb.innerHTML = html;
}

function showProjectSettings(projectId) {
  // プロジェクト情報を取得
  axios.get(`/api/projects/${projectId}`)
    .then(response => {
      const project = response.data;
      
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white rounded-lg p-8 max-w-md w-full">
          <h3 class="text-2xl font-bold mb-4">プロジェクト設定</h3>
          
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">プロジェクト名</label>
              <input id="edit-project-name" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" value="${escapeHtml(project.name)}" />
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">説明</label>
              <textarea id="edit-project-description" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" rows="3">${escapeHtml(project.description || '')}</textarea>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">
                進捗率: <span id="progress-value">${project.progress}</span>%
              </label>
              <div class="flex items-center space-x-4">
                <input type="range" id="edit-project-progress" min="0" max="100" value="${project.progress}" 
                  class="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  oninput="document.getElementById('progress-value').textContent = this.value" />
                <input type="number" id="edit-project-progress-input" min="0" max="100" value="${project.progress}" 
                  class="w-20 px-2 py-1 border border-gray-300 rounded-lg focus:outline-none focus:border-orange"
                  oninput="document.getElementById('edit-project-progress').value = this.value; document.getElementById('progress-value').textContent = this.value" />
              </div>
              <div class="mt-2 w-full bg-gray-200 rounded-full h-2">
                <div id="progress-preview" class="bg-orange h-2 rounded-full progress-bar" style="width: ${project.progress}%"></div>
              </div>
            </div>
            
            ${currentUser.username === 'admin' ? `
            <div class="border-t border-gray-200 pt-4 mt-4">
              <button onclick="deleteProject(${projectId})" class="w-full bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 transition">
                <i class="fas fa-trash mr-2"></i>プロジェクトを削除
              </button>
            </div>
            ` : ''}
            
            <div class="flex space-x-3">
              <button onclick="updateProject(${projectId})" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition">
                保存
              </button>
              <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
                キャンセル
              </button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // スライダーの変更時にプレビューを更新
      const progressSlider = document.getElementById('edit-project-progress');
      const progressInput = document.getElementById('edit-project-progress-input');
      const progressPreview = document.getElementById('progress-preview');
      
      const updatePreview = () => {
        const value = progressSlider.value;
        progressPreview.style.width = value + '%';
        progressInput.value = value;
        document.getElementById('progress-value').textContent = value;
      };
      
      progressSlider.addEventListener('input', updatePreview);
      progressInput.addEventListener('input', (e) => {
        let value = parseInt(e.target.value);
        if (value < 0) value = 0;
        if (value > 100) value = 100;
        progressSlider.value = value;
        updatePreview();
      });
    })
    .catch(error => {
      console.error('プロジェクト取得エラー:', error);
      showNotification('プロジェクト情報の取得に失敗しました', 'error');
    });
}

async function updateProject(projectId) {
  const name = document.getElementById('edit-project-name').value;
  const description = document.getElementById('edit-project-description').value;
  const progress = parseInt(document.getElementById('edit-project-progress').value);
  
  if (!name) {
    showNotification('プロジェクト名を入力してください', 'error');
    return;
  }
  
  if (progress < 0 || progress > 100) {
    showNotification('進捗率は0〜100の範囲で入力してください', 'error');
    return;
  }
  
  try {
    await axios.put(`/api/projects/${projectId}`, {
      name,
      description,
      progress
    });
    
    document.querySelector('.fixed').remove();
    showNotification('プロジェクトを更新しました', 'success');
    loadProjectHeader(projectId);
  } catch (error) {
    console.error('プロジェクト更新エラー:', error);
    showNotification('プロジェクトの更新に失敗しました', 'error');
  }
}

async function deleteProject(projectId) {
  if (!confirm('このプロジェクトを削除しますか？この操作は取り消せません。')) {
    return;
  }
  
  try {
    await axios.delete(`/api/projects/${projectId}`, {
      data: { userId: currentUser.id }
    });
    
    document.querySelector('.fixed').remove();
    showNotification('プロジェクトを削除しました', 'success');
    showProjectsPage();
  } catch (error) {
    console.error('プロジェクト削除エラー:', error);
    if (error.response && error.response.status === 403) {
      showNotification('削除権限がありません', 'error');
    } else {
      showNotification('プロジェクトの削除に失敗しました', 'error');
    }
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
          <div class="flex items-center space-x-2 ml-4">
            <button onclick="event.stopPropagation(); downloadSubprojectAsZip(${sub.id}, '${sub.name}')" class="text-gray-500 hover:text-orange" title="ZIPダウンロード">
              <i class="fas fa-download"></i>
            </button>
            ${currentUser.username === 'admin' ? `
            <button onclick="event.stopPropagation(); deleteSubproject(${sub.id}, '${sub.name}')" class="text-gray-500 hover:text-red-500" title="削除">
              <i class="fas fa-trash"></i>
            </button>
            ` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('子プロジェクト取得エラー:', error);
  }
}

let currentTimelinePage = 1;

async function loadTimeline(projectId, page = 1) {
  try {
    currentTimelinePage = page;
    const response = await axios.get(`/api/projects/${projectId}/timeline?page=${page}`);
    const { items: timeline, pagination } = response.data;
    
    const list = document.getElementById('timeline-list');
    
    if (timeline.length === 0) {
      list.innerHTML = `
        <div class="text-center py-8 text-gray-500 bg-white border border-gray-200 rounded-lg">
          <p class="text-sm">アクティビティなし</p>
        </div>
      `;
      return;
    }
    
    let html = timeline.map(item => {
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
    
    // ページネーションUIを追加
    if (pagination.totalPages > 1) {
      html += `
        <div class="flex justify-between items-center mt-4 pt-4 border-t border-gray-200">
          <button 
            onclick="loadTimeline(${projectId}, ${page - 1})" 
            ${page === 1 ? 'disabled' : ''}
            class="px-3 py-1 text-sm ${page === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-orange hover:text-orange-dark'}">
            <i class="fas fa-chevron-left mr-1"></i>前へ
          </button>
          <span class="text-sm text-gray-600">
            ${page} / ${pagination.totalPages} ページ (全${pagination.total}件)
          </span>
          <button 
            onclick="loadTimeline(${projectId}, ${page + 1})" 
            ${page === pagination.totalPages ? 'disabled' : ''}
            class="px-3 py-1 text-sm ${page === pagination.totalPages ? 'text-gray-400 cursor-not-allowed' : 'text-orange hover:text-orange-dark'}">
            次へ<i class="fas fa-chevron-right ml-1"></i>
          </button>
        </div>
      `;
    }
    
    list.innerHTML = html;
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

async function downloadSubprojectAsZip(subprojectId, subprojectName) {
  try {
    // 全ファイルを取得
    const response = await axios.get(`/api/subprojects/${subprojectId}/files/all`);
    const files = response.data;
    
    if (files.length === 0) {
      showNotification('ダウンロードするファイルがありません', 'info');
      return;
    }
    
    showNotification('ZIPファイルを作成中...', 'info');
    
    // JSZipインスタンスを作成
    const zip = new JSZip();
    
    // 各ファイルをZIPに追加
    for (const file of files) {
      try {
        // ファイル内容を取得
        const fileResponse = await axios.get(`/api/files/${file.id}/download`, {
          responseType: 'text'
        });
        
        let fileContent = fileResponse.data;
        const filePath = getFilePath(file);
        
        // Base64エンコードされたファイルの場合はデコード
        if (file.mime_type && !file.mime_type.startsWith('text/') && fileContent.startsWith('data:')) {
          // data:image/png;base64,xxxxx の形式の場合
          const base64Data = fileContent.split(',')[1];
          const binaryString = atob(base64Data);
          // バイナリ文字列をUint8Arrayに変換
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          zip.file(filePath, bytes);
        } else if (file.content && file.content.startsWith('data:')) {
          // データベースに保存されているBase64データの場合
          const base64Data = file.content.split(',')[1];
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          zip.file(filePath, bytes);
        } else {
          // テキストファイルの場合はそのまま
          zip.file(filePath, fileContent);
        }
      } catch (error) {
        console.error(`ファイル ${file.name} の取得に失敗:`, error);
      }
    }
    
    // ZIPファイルを生成
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    // ダウンロード
    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = `${subprojectName}.zip`;
    link.click();
    
    // メモリを解放
    URL.revokeObjectURL(link.href);
    
    showNotification('ZIPファイルをダウンロードしました', 'success');
  } catch (error) {
    console.error('ZIPダウンロードエラー:', error);
    showNotification('ZIPファイルのダウンロードに失敗しました', 'error');
  }
}

function getFilePath(file) {
  // パスを構築（ルートパスの場合はファイル名のみ、それ以外はパスを含める）
  if (file.path === '/') {
    return file.name;
  }
  // パスの先頭のスラッシュを削除して、ファイル名を追加
  const path = file.path.replace(/^\//, '');
  return `${path}/${file.name}`;
}

async function deleteSubproject(subprojectId, subprojectName) {
  if (!confirm(`子プロジェクト「${subprojectName}」とその中のすべてのファイルを削除しますか？この操作は取り消せません。`)) {
    return;
  }
  
  try {
    // まず子プロジェクト内のすべてのファイルを取得
    const filesResponse = await axios.get(`/api/subprojects/${subprojectId}/files/all`);
    const files = filesResponse.data;
    
    // すべてのファイルを削除
    for (const file of files) {
      try {
        await axios.delete(`/api/files/${file.id}`, {
          data: {
            userId: currentUser.id,
            projectId: currentProject,
            fileName: file.name
          }
        });
      } catch (error) {
        console.error(`ファイル削除エラー (${file.name}):`, error);
      }
    }
    
    // 子プロジェクトを削除
    await axios.delete(`/api/subprojects/${subprojectId}`, {
      data: { userId: currentUser.id }
    });
    
    showNotification('子プロジェクトとすべてのファイルを削除しました', 'success');
    loadSubprojects(currentProject);
  } catch (error) {
    console.error('子プロジェクト削除エラー:', error);
    if (error.response && error.response.status === 403) {
      showNotification('削除権限がありません', 'error');
    } else {
      showNotification('子プロジェクトの削除に失敗しました', 'error');
    }
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
      <div id="project-breadcrumb" class="mb-4 text-sm text-gray-600">読み込み中...</div>
      
      <div class="mb-4">
        <div class="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg p-2">
          <i class="fas fa-search text-gray-400 ml-2"></i>
          <input type="text" id="file-search-input" placeholder="ファイル名で検索..." class="flex-1 outline-none px-2 py-1" oninput="performSearch()">
          <button onclick="showAdvancedSearchModal()" class="text-gray-500 hover:text-orange px-3 py-1 text-sm">
            <i class="fas fa-filter mr-1"></i>高度な検索
          </button>
          <button id="clear-search-btn" onclick="clearSearch()" class="hidden text-gray-500 hover:text-red-500 px-3 py-1">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
      
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 id="subproject-title" class="text-2xl font-bold text-gray-900">読み込み中...</h2>
          <div id="breadcrumb" class="text-sm text-gray-600 mt-2"></div>
        </div>
        <div class="flex space-x-2">
          <div id="bulk-actions" class="hidden flex space-x-2 mr-2">
            <button onclick="downloadSelectedFiles()" class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition">
              <i class="fas fa-download mr-2"></i>選択をダウンロード
            </button>
            <button onclick="deleteSelectedFiles()" class="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition">
              <i class="fas fa-trash mr-2"></i>選択を削除
            </button>
          </div>
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
      
      <div class="flex gap-4">
        <div class="flex-1 bg-white border border-gray-200 rounded-lg">
          <div id="files-list">読み込み中...</div>
        </div>
        <div id="file-history-sidebar" class="w-80 bg-white border border-gray-200 rounded-lg p-4 hidden">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-semibold text-gray-900">変更ログ</h3>
            <button onclick="closeFileHistorySidebar()" class="text-gray-500 hover:text-gray-700">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div id="file-history-content" class="text-sm text-gray-600">ファイルを選択してください</div>
        </div>
      </div>
    </div>
  `;
  
  // 子プロジェクト情報を取得して名前を保存
  try {
    // プロジェクト情報を取得
    const projectResponse = await axios.get(`/api/projects/${currentProject}`);
    currentProjectName = projectResponse.data.name;
    
    // 子プロジェクト名を取得
    const subprojectsResponse = await axios.get(`/api/projects/${currentProject}/subprojects`);
    const subproject = subprojectsResponse.data.find(s => s.id === subprojectId);
    if (subproject) {
      currentSubprojectName = subproject.name;
      // タイトルを更新
      const titleElement = document.getElementById('subproject-title');
      if (titleElement) {
        titleElement.textContent = subproject.name;
      }
    }
    
    updateProjectBreadcrumb();
  } catch (error) {
    console.error('情報取得エラー:', error);
  }
  
  await loadFiles(subprojectId, currentPath);
}

async function loadFiles(subprojectId, path = '/') {
  currentPath = path;
  
  // 検索中でない場合は通常のファイル一覧を表示
  if (!currentSearchQuery && !Object.values(currentFilters).some(v => v !== null)) {
    await loadFilesNormal(subprojectId, path);
  } else {
    await loadFilesWithSearch();
  }
}

async function loadFilesNormal(subprojectId, path = '/') {
  currentPath = path;
  
  try {
    const response = await axios.get(`/api/subprojects/${subprojectId}/files?path=${encodeURIComponent(path)}`);
    const files = response.data;
    
    // パンくずリスト更新
    updateBreadcrumb(path);
    
    const list = document.getElementById('files-list');
    if (!list) return;
    
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
    
    // 全選択チェックボックス
    html += `
      <div class="flex items-center p-3 bg-gray-50 border-b border-gray-200">
        <input type="checkbox" id="select-all-files" onchange="toggleSelectAll()" class="w-4 h-4 text-orange border-gray-300 rounded focus:ring-orange">
        <label for="select-all-files" class="ml-2 text-sm text-gray-700 cursor-pointer">すべて選択</label>
      </div>
    `;
    
    html += files.map((file, index) => {
      const isFolder = file.file_type === 'folder';
      const iconSVG = getFileIconSVG(file);
      const nextPath = isFolder ? `${path === '/' ? '' : path}/${file.name}` : null;
      
      // HTMLエスケープ処理
      const escapedFileName = escapeHtml(file.name);
      const escapedPath = nextPath ? escapeHtml(nextPath) : '';
      
      return `
        <div class="flex items-center justify-between p-4 hover:bg-gray-50 ${index > 0 || path !== '/' ? 'border-t border-gray-200' : ''}" data-file-id="${file.id}" draggable="true" ondragstart="handleDragStart(event, ${file.id}, ${isFolder})" ondragend="handleDragEnd(event)" oncontextmenu="event.preventDefault(); showContextMenu(event, ${file.id}, '${escapedFileName}', ${isFolder})" ${isFolder ? `ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, ${file.id}, '${escapedPath}')"` : ''}>
          <div class="flex items-center flex-1">
            <input type="checkbox" class="file-checkbox w-4 h-4 text-orange border-gray-300 rounded focus:ring-orange mr-3" data-file-id="${file.id}" data-file-name="${escapedFileName}" data-is-folder="${isFolder}" onchange="updateBulkActions()" onclick="event.stopPropagation();">
            <div class="flex items-center flex-1 ${isFolder ? 'cursor-pointer' : 'cursor-pointer'}" onclick="${isFolder ? `loadFiles(${subprojectId}, '${escapedPath}')` : `selectFile(${file.id})`}">
              <div class="mr-4 flex-shrink-0">${iconSVG}</div>
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
    
    // 一括操作ボタンの初期状態を更新
    updateBulkActions();
  } catch (error) {
    console.error('ファイル取得エラー:', error);
  }
}

// 全選択/全解除
function toggleSelectAll() {
  const selectAllCheckbox = document.getElementById('select-all-files');
  const checkboxes = document.querySelectorAll('.file-checkbox');
  
  checkboxes.forEach(checkbox => {
    checkbox.checked = selectAllCheckbox.checked;
  });
  
  updateBulkActions();
}

// 一括操作ボタンの表示/非表示を更新
function updateBulkActions() {
  const checkboxes = document.querySelectorAll('.file-checkbox:checked');
  const bulkActions = document.getElementById('bulk-actions');
  
  if (checkboxes.length > 0) {
    bulkActions.classList.remove('hidden');
  } else {
    bulkActions.classList.add('hidden');
  }
  
  // 全選択チェックボックスの状態を更新
  const allCheckboxes = document.querySelectorAll('.file-checkbox');
  const selectAllCheckbox = document.getElementById('select-all-files');
  if (selectAllCheckbox && allCheckboxes.length > 0) {
    selectAllCheckbox.checked = checkboxes.length === allCheckboxes.length;
  }
}

// 選択したファイルを一括ダウンロード
async function downloadSelectedFiles() {
  const checkboxes = document.querySelectorAll('.file-checkbox:checked');
  
  if (checkboxes.length === 0) {
    showNotification('ファイルを選択してください', 'error');
    return;
  }
  
  const files = Array.from(checkboxes).map(checkbox => ({
    id: parseInt(checkbox.dataset.fileId),
    name: checkbox.dataset.fileName,
    isFolder: checkbox.dataset.isFolder === 'true'
  })).filter(file => !file.isFolder); // フォルダは除外
  
  if (files.length === 0) {
    showNotification('ファイルを選択してください（フォルダは除外されます）', 'error');
    return;
  }
  
  try {
    const zip = new JSZip();
    
    // 各ファイルをダウンロードしてZIPに追加
    for (const file of files) {
      try {
        const response = await axios.get(`/api/files/${file.id}/download`, {
          responseType: 'blob'
        });
        
        zip.file(file.name, response.data);
      } catch (error) {
        console.error(`ファイル ${file.name} のダウンロードエラー:`, error);
      }
    }
    
    // ZIPファイルを生成してダウンロード
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selected-files-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification(`${files.length}個のファイルをダウンロードしました`, 'success');
    
    // チェックボックスをクリア
    checkboxes.forEach(checkbox => checkbox.checked = false);
    updateBulkActions();
  } catch (error) {
    console.error('一括ダウンロードエラー:', error);
    showNotification('ファイルのダウンロードに失敗しました', 'error');
  }
}

// 選択したファイルを一括削除
async function deleteSelectedFiles() {
  const checkboxes = document.querySelectorAll('.file-checkbox:checked');
  
  if (checkboxes.length === 0) {
    showNotification('ファイルを選択してください', 'error');
    return;
  }
  
  const files = Array.from(checkboxes).map(checkbox => ({
    id: parseInt(checkbox.dataset.fileId),
    name: checkbox.dataset.fileName,
    isFolder: checkbox.dataset.isFolder === 'true'
  }));
  
  const fileCount = files.filter(f => !f.isFolder).length;
  const folderCount = files.filter(f => f.isFolder).length;
  
  let message = '';
  if (fileCount > 0 && folderCount > 0) {
    message = `${fileCount}個のファイルと${folderCount}個のフォルダを削除しますか？この操作は取り消せません。`;
  } else if (fileCount > 0) {
    message = `${fileCount}個のファイルを削除しますか？この操作は取り消せません。`;
  } else {
    message = `${folderCount}個のフォルダを削除しますか？この操作は取り消せません。`;
  }
  
  if (!confirm(message)) {
    return;
  }
  
  try {
    let successCount = 0;
    let failCount = 0;
    
    for (const file of files) {
      try {
        await axios.delete(`/api/files/${file.id}`, {
          data: {
            userId: currentUser.id,
            projectId: currentProject,
            fileName: file.name
          }
        });
        successCount++;
      } catch (error) {
        console.error(`ファイル削除エラー (${file.name}):`, error);
        failCount++;
      }
    }
    
    if (failCount === 0) {
      showNotification(`${successCount}個のアイテムを削除しました`, 'success');
    } else {
      showNotification(`${successCount}個のアイテムを削除しました（${failCount}個失敗）`, 'warning');
    }
    
    // ファイル一覧を再読み込み
    await loadFiles(currentSubproject, currentPath);
    loadTimeline(currentProject);
  } catch (error) {
    console.error('一括削除エラー:', error);
    showNotification('ファイルの削除に失敗しました', 'error');
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
  selectedFiles = []; // 選択ファイルをリセット
  
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-2xl w-full">
      <h3 class="text-2xl font-bold mb-4">ファイルアップロード</h3>
      
      <div class="space-y-4">
        <div id="drop-zone" class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center transition-colors">
          <input type="file" id="file-upload" multiple webkitdirectory="" directory="" class="hidden" onchange="handleFileSelect(event)" />
          <input type="file" id="file-upload-normal" multiple class="hidden" onchange="handleFileSelect(event)" />
          
          <i class="fas fa-cloud-upload-alt text-6xl text-gray-400 mb-4"></i>
          <p class="text-gray-600 mb-2">ファイルをドラッグ&ドロップ</p>
          <p class="text-sm text-gray-500 mb-4">または</p>
          
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
  
  // ドラッグ&ドロップイベントリスナーを追加
  const dropZone = document.getElementById('drop-zone');
  
  // ドラッグオーバー時の処理
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('border-orange', 'bg-orange-50');
    dropZone.classList.remove('border-gray-300');
  });
  
  // ドラッグリーブ時の処理
  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('border-orange', 'bg-orange-50');
    dropZone.classList.add('border-gray-300');
  });
  
  // ドロップ時の処理
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('border-orange', 'bg-orange-50');
    dropZone.classList.add('border-gray-300');
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // 既存のファイルとマージ
      selectedFiles = [...selectedFiles, ...files];
      handleFileSelect({ target: { files: e.dataTransfer.files } });
    }
  });
  
  // モーダル全体でもドロップを受け付ける（ドロップゾーン外でも）
  modal.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  
  modal.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      selectedFiles = [...selectedFiles, ...files];
      handleFileSelect({ target: { files: e.dataTransfer.files } });
    }
  });
}

let selectedFiles = [];

function handleFileSelect(event) {
  const newFiles = Array.from(event.target.files);
  
  // 既存のファイルとマージ（重複を避ける）
  const existingNames = new Set(selectedFiles.map(f => f.name + f.size + f.lastModified));
  const uniqueNewFiles = newFiles.filter(f => !existingNames.has(f.name + f.size + f.lastModified));
  selectedFiles = [...selectedFiles, ...uniqueNewFiles];
  
  const preview = document.getElementById('upload-preview');
  const uploadBtn = document.getElementById('upload-btn');
  
  if (selectedFiles.length === 0) {
    preview.innerHTML = '';
    uploadBtn.disabled = true;
    return;
  }
  
  uploadBtn.disabled = false;
  
  preview.innerHTML = `
    <div class="text-sm text-gray-600 mb-2">
      <i class="fas fa-info-circle mr-2"></i>${selectedFiles.length}個のファイルが選択されています
    </div>
    ${selectedFiles.slice(0, 10).map(file => `
      <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
        <span class="text-sm truncate flex-1">${file.webkitRelativePath || file.name}</span>
        <span class="text-xs text-gray-500 ml-2">${formatFileSize(file.size)}</span>
      </div>
    `).join('')}
    ${selectedFiles.length > 10 ? `<div class="text-sm text-gray-500 text-center">他 ${selectedFiles.length - 10} 個のファイル...</div>` : ''}
  `;
}

// チャンクサイズ（10MB）
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const LARGE_FILE_THRESHOLD = 20 * 1024 * 1024; // 20MB以上はチャンクアップロード

// リトライ用のヘルパー関数（指数バックオフ）
async function retryRequest(requestFn, maxRetries = 5, baseDelay = 1000, progressCallback = null) {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;
      
      // 503エラーまたはネットワークエラーの場合のみリトライ
      const isRetryable = error.response?.status === 503 || 
                         error.response?.status >= 500 ||
                         error.code === 'ECONNABORTED' ||
                         error.code === 'ETIMEDOUT' ||
                         !error.response;
      
      if (!isRetryable || attempt === maxRetries - 1) {
        throw error;
      }
      
      // 指数バックオフ: 1秒、2秒、4秒、8秒、16秒
      const delay = baseDelay * Math.pow(2, attempt);
      const retryMessage = `リトライ ${attempt + 1}/${maxRetries} (${delay/1000}秒待機)...`;
      console.log(retryMessage, error.message);
      
      // 進捗コールバックがある場合は呼び出し
      if (progressCallback) {
        progressCallback(retryMessage);
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

async function uploadFiles() {
  if (selectedFiles.length === 0) {
    showNotification('ファイルを選択してください', 'error');
    return;
  }
  
  const uploadBtn = document.getElementById('upload-btn');
  uploadBtn.disabled = true;
  
  const modal = document.querySelector('.fixed');
  const preview = document.getElementById('upload-preview');
  
  try {
    let successCount = 0;
    let failCount = 0;
    const totalFiles = selectedFiles.length;
    
    // 進捗表示を追加
    preview.innerHTML = `
      <div class="mb-4">
        <div id="upload-progress-text" class="text-sm text-gray-600 mb-2">アップロード中: 0/${totalFiles}</div>
        <div class="w-full bg-gray-200 rounded-full h-2 mb-2">
          <div id="upload-progress" class="bg-orange h-2 rounded-full transition-all" style="width: 0%"></div>
        </div>
        <div id="upload-file-progress" class="text-xs text-gray-500 space-y-1 max-h-32 overflow-y-auto"></div>
      </div>
    `;
    
    // 必要なフォルダを事前に作成（階層順に）
    const folderPaths = new Set();
    selectedFiles.forEach(file => {
      const relativePath = file.webkitRelativePath || file.name;
      const pathParts = relativePath.split('/');
      pathParts.pop(); // ファイル名を除外
      
      if (pathParts.length > 0) {
        let currentFolderPath = currentPath === '/' ? '' : currentPath;
        pathParts.forEach(folderName => {
          if (folderName) {
            currentFolderPath = currentFolderPath === '' ? `/${folderName}` : `${currentFolderPath}/${folderName}`;
            folderPaths.add(currentFolderPath);
          }
        });
      }
    });
    
    // フォルダパスを階層順にソート（短いパスから長いパスへ）
    const sortedFolderPaths = Array.from(folderPaths).sort((a, b) => {
      const aDepth = a.split('/').filter(p => p).length;
      const bDepth = b.split('/').filter(p => p).length;
      return aDepth - bDepth;
    });
    
    // フォルダを階層順に作成
    for (const folderPath of sortedFolderPaths) {
      try {
        const pathParts = folderPath.split('/').filter(p => p);
        const folderName = pathParts[pathParts.length - 1];
        const parentPath = pathParts.length > 1 ? '/' + pathParts.slice(0, -1).join('/') : '/';
        
        await axios.post(`/api/subprojects/${currentSubproject}/folders`, {
          name: folderName,
          path: parentPath,
          userId: currentUser.id,
          projectId: currentProject
        });
      } catch (error) {
        // エラーは無視（既に存在する場合など）
        console.error(`フォルダ作成エラー (${folderPath}):`, error);
      }
    }
    
    // ファイルを個別にアップロード（並列処理、最大2つまで）
    const maxConcurrent = 2;
    
    for (let i = 0; i < selectedFiles.length; i += maxConcurrent) {
      const batch = selectedFiles.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (file) => {
        try {
          const relativePath = file.webkitRelativePath || file.name;
          const pathParts = relativePath.split('/');
          const fileName = pathParts.pop();
          const filePath = currentPath === '/' ? 
            (pathParts.length > 0 ? '/' + pathParts.join('/') : '/') :
            (pathParts.length > 0 ? currentPath + '/' + pathParts.join('/') : currentPath);
          
          // 重複チェック
          const duplicateCheck = await checkFileDuplicate(fileName, filePath);
          if (duplicateCheck.duplicate) {
            // 重複がある場合はユーザーに選択を求める
            await new Promise((resolve, reject) => {
              showDuplicateFileDialog(fileName, duplicateCheck.file, file, filePath, resolve, reject);
            });
          } else {
            // 重複がない場合は通常通りアップロード
            await uploadFileToS3(file, fileName, filePath, false);
          }
          
          successCount++;
        } catch (error) {
          if (error.message === 'アップロードがキャンセルされました') {
            // キャンセルは失敗としてカウントしない
            console.log(`ファイル ${file.name} のアップロードがキャンセルされました`);
          } else {
            console.error(`ファイル ${file.name} のアップロードエラー:`, error);
            failCount++;
          }
        } finally {
          // 進捗更新
          const progress = ((successCount + failCount) / totalFiles) * 100;
          const progressBar = document.getElementById('upload-progress');
          const progressText = document.getElementById('upload-progress-text');
          if (progressBar) {
            progressBar.style.width = `${progress}%`;
          }
          if (progressText) {
            progressText.textContent = `アップロード中: ${successCount + failCount}/${totalFiles}`;
          }
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    modal.remove();
    
    if (failCount === 0) {
      showNotification(`${successCount}個のファイルをアップロードしました`, 'success');
    } else {
      showNotification(`${successCount}個のファイルをアップロードしました（${failCount}個失敗）`, 'warning');
    }
    
    loadFiles(currentSubproject, currentPath);
    loadTimeline(currentProject);
  } catch (error) {
    console.error('アップロードエラー:', error);
    showNotification('ファイルのアップロードに失敗しました', 'error');
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = 'アップロード';
  }
}

// ファイル重複チェック
async function checkFileDuplicate(fileName, filePath) {
  try {
    const response = await axios.get(`/api/subprojects/${currentSubproject}/files/check-duplicate`, {
      params: {
        name: fileName,
        path: filePath
      }
    });
    return response.data;
  } catch (error) {
    console.error('重複チェックエラー:', error);
    return { duplicate: false };
  }
}

// 重複ファイル処理選択ダイアログ
function showDuplicateFileDialog(fileName, existingFile, file, filePath, resolve, reject) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <h3 class="text-lg font-semibold mb-4">ファイル名が重複しています</h3>
      <p class="text-gray-600 mb-4">
        同じ名前のファイル「<strong>${fileName}</strong>」が既に存在します。
      </p>
      <div class="bg-gray-50 rounded p-3 mb-4 text-sm">
        <p><strong>既存ファイル:</strong> ${existingFile.name}</p>
        <p><strong>更新日時:</strong> ${new Date(existingFile.updated_at).toLocaleString('ja-JP')}</p>
        <p><strong>更新者:</strong> ${existingFile.updated_by_name || '不明'}</p>
        <p><strong>サイズ:</strong> ${(existingFile.file_size / 1024).toFixed(2)} KB</p>
      </div>
      <div class="flex gap-3">
        <button id="duplicate-cancel" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
          キャンセル
        </button>
        <button id="duplicate-overwrite" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition">
          上書き
        </button>
        <button id="duplicate-rename" class="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition">
          名前を変えて保存
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // キャンセル
  document.getElementById('duplicate-cancel').addEventListener('click', () => {
    modal.remove();
    reject(new Error('アップロードがキャンセルされました'));
  });
  
  // 上書き
  document.getElementById('duplicate-overwrite').addEventListener('click', async () => {
    modal.remove();
    try {
      // 既存ファイルを削除してからアップロード
      await axios.delete(`/api/files/${existingFile.id}`, {
        data: {
          userId: currentUser.id,
          projectId: currentProject,
          fileName: existingFile.name
        }
      });
      // アップロードを続行
      await uploadFileToS3(file, fileName, filePath, true);
      resolve();
    } catch (error) {
      console.error('上書きエラー:', error);
      reject(error);
    }
  });
  
  // 名前を変えて保存
  document.getElementById('duplicate-rename').addEventListener('click', () => {
    modal.remove();
    const renameModal = document.createElement('div');
    renameModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    renameModal.innerHTML = `
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 class="text-lg font-semibold mb-4">新しいファイル名を入力</h3>
        <input type="text" id="new-file-name" value="${fileName}" class="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-orange">
        <div class="flex gap-3">
          <button id="rename-cancel" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
            キャンセル
          </button>
          <button id="rename-save" class="flex-1 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition">
            保存
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(renameModal);
    
    const newFileNameInput = document.getElementById('new-file-name');
    newFileNameInput.focus();
    newFileNameInput.select();
    
    document.getElementById('rename-cancel').addEventListener('click', () => {
      renameModal.remove();
      reject(new Error('アップロードがキャンセルされました'));
    });
    
    document.getElementById('rename-save').addEventListener('click', async () => {
      const newFileName = newFileNameInput.value.trim();
      if (!newFileName) {
        showNotification('ファイル名を入力してください', 'error');
        return;
      }
      renameModal.remove();
      try {
        await uploadFileToS3(file, newFileName, filePath, false);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    
    newFileNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('rename-save').click();
      }
    });
  });
}

// S3直接アップロード関数（Presigned URL使用）
async function uploadFileToS3(file, fileName, filePath, skipDuplicateCheck = false) {
  const fileProgressDiv = document.getElementById('upload-file-progress');
  const fileProgressId = `file-progress-${Date.now()}-${Math.random()}`;
  
  // 個別ファイルの進捗表示を追加
  if (fileProgressDiv) {
    const fileProgressHTML = `
      <div id="${fileProgressId}" class="border border-gray-200 rounded p-2 bg-gray-50">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs font-medium text-gray-700 truncate flex-1 mr-2">${fileName}</span>
          <span class="text-xs text-gray-500" id="${fileProgressId}-text">準備中...</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-1.5">
          <div id="${fileProgressId}-bar" class="bg-blue-500 h-1.5 rounded-full transition-all" style="width: 0%"></div>
        </div>
        <div class="text-xs text-gray-500 mt-1" id="${fileProgressId}-status">AWS高速ストレージにアップロード中...</div>
        <div class="text-xs text-gray-600 mt-1 font-mono" id="${fileProgressId}-speed">0 MB / ${(file.size / 1024 / 1024).toFixed(2)} MB - 0 MB/s</div>
      </div>
    `;
    fileProgressDiv.insertAdjacentHTML('beforeend', fileProgressHTML);
  }
  
  try {
    // 1. Presigned URLを取得
    const progressBar = document.getElementById(`${fileProgressId}-bar`);
    const progressText = document.getElementById(`${fileProgressId}-text`);
    const statusText = document.getElementById(`${fileProgressId}-status`);
    
    if (progressBar) progressBar.style.width = '10%';
    if (progressText) progressText.textContent = 'URL取得中...';
    
    const response = await axios.post(`/api/subprojects/${currentSubproject}/files/presigned-url`, {
      fileName: fileName,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      path: filePath,
      userId: currentUser.id,
      projectId: currentProject
    });
    
    const { fileId, presignedUrl, callbackUrl } = response.data;
    
    if (progressBar) progressBar.style.width = '20%';
    if (progressText) progressText.textContent = 'アップロード中...';
    if (statusText) {
      statusText.textContent = 'AWS高速ストレージにアップロード中...';
    }
    
    // 速度表示の初期化
    const speedText = document.getElementById(`${fileProgressId}-speed`);
    const totalSizeMB = file.size / 1024 / 1024;
    if (speedText) {
      speedText.textContent = `0.00 MB / ${totalSizeMB.toFixed(2)} MB - 0.00 MB/s`;
    }
    
    // 2. 直接S3にアップロード（XMLHttpRequestで進捗を追跡）
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let lastLoaded = 0;
      let lastTime = Date.now();
      
      // 進捗イベント
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const currentTime = Date.now();
          const timeDiff = (currentTime - lastTime) / 1000; // 秒
          const loadedDiff = e.loaded - lastLoaded; // バイト
          
          // 転送速度を計算（MB/s）- 最初のイベント以降のみ計算
          let speedMBps = 0;
          if (lastLoaded > 0 && timeDiff > 0) {
            speedMBps = (loadedDiff / 1024 / 1024) / timeDiff;
          }
          
          const percentComplete = (e.loaded / e.total) * 100;
          const loadedMB = e.loaded / 1024 / 1024;
          
          if (progressBar) {
            progressBar.style.width = `${20 + (percentComplete * 0.7)}%`; // 20%から90%まで
          }
          if (progressText) {
            progressText.textContent = `${Math.round(percentComplete)}%`;
          }
          
          // 速度表示を更新
          const speedTextElement = document.getElementById(`${fileProgressId}-speed`);
          if (speedTextElement) {
            if (lastLoaded > 0 && speedMBps > 0) {
              speedTextElement.textContent = `${loadedMB.toFixed(2)} MB / ${totalSizeMB.toFixed(2)} MB - ${speedMBps.toFixed(2)} MB/s`;
            } else {
              speedTextElement.textContent = `${loadedMB.toFixed(2)} MB / ${totalSizeMB.toFixed(2)} MB - 計算中...`;
            }
          }
          
          lastLoaded = e.loaded;
          lastTime = currentTime;
        }
      });
      
      // 完了イベント
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          if (progressBar) progressBar.style.width = '90%';
          if (progressText) progressText.textContent = '完了処理中...';
          resolve();
        } else {
          reject(new Error(`アップロード失敗: ${xhr.status}`));
        }
      });
      
      // エラーイベント
      xhr.addEventListener('error', () => {
        reject(new Error('ネットワークエラー'));
      });
      
      // リクエスト開始
      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.send(file);
    });
    
    // 3. アップロード完了を通知
    await axios.post(callbackUrl, {
      s3Key: response.data.s3Key,
      userId: currentUser.id,
      projectId: currentProject
    });
    
    // 完了状態を表示
    if (progressBar) {
      progressBar.style.width = '100%';
      progressBar.classList.remove('bg-blue-500');
      progressBar.classList.add('bg-green-500');
    }
    if (progressText) {
      progressText.textContent = '完了';
      progressText.classList.remove('text-gray-500');
      progressText.classList.add('text-green-600', 'font-semibold');
    }
    if (statusText) {
      statusText.textContent = 'アップロード完了';
      statusText.classList.add('text-green-600');
    }
    
    // 速度表示を最終状態に更新
    const finalSpeedText = document.getElementById(`${fileProgressId}-speed`);
    if (finalSpeedText) {
      const totalSizeMB = file.size / 1024 / 1024;
      finalSpeedText.textContent = `${totalSizeMB.toFixed(2)} MB / ${totalSizeMB.toFixed(2)} MB - 完了`;
      finalSpeedText.classList.add('text-green-600');
    }
  } catch (error) {
    console.error(`S3アップロードエラー (${fileName}):`, error);
    const progressBar = document.getElementById(`${fileProgressId}-bar`);
    const progressText = document.getElementById(`${fileProgressId}-text`);
    const statusText = document.getElementById(`${fileProgressId}-status`);
    const errorSpeedText = document.getElementById(`${fileProgressId}-speed`);
    
    if (progressBar) {
      progressBar.classList.remove('bg-blue-500');
      progressBar.classList.add('bg-red-500');
    }
    if (progressText) {
      progressText.textContent = 'エラー';
      progressText.classList.remove('text-gray-500');
      progressText.classList.add('text-red-600', 'font-semibold');
    }
    if (statusText) {
      statusText.textContent = 'アップロード失敗';
      statusText.classList.add('text-red-600');
    }
    if (errorSpeedText) {
      errorSpeedText.textContent = 'エラーが発生しました';
      errorSpeedText.classList.add('text-red-600');
    }
    throw error;
  }
}

// チャンクアップロード関数（後方互換性のため残す）
async function uploadFileInChunks(file, fileName, filePath) {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const fileProgressDiv = document.getElementById('upload-file-progress');
  const fileProgressId = `file-progress-${Date.now()}-${Math.random()}`;
  
  // 個別ファイルの進捗表示を追加
  if (fileProgressDiv) {
    const fileProgressHTML = `
      <div id="${fileProgressId}" class="border border-gray-200 rounded p-2 bg-gray-50">
        <div class="flex justify-between items-center mb-1">
          <span class="text-xs font-medium text-gray-700 truncate flex-1 mr-2">${fileName}</span>
          <span class="text-xs text-gray-500" id="${fileProgressId}-text">0%</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-1.5">
          <div id="${fileProgressId}-bar" class="bg-blue-500 h-1.5 rounded-full transition-all" style="width: 0%"></div>
        </div>
        <div class="flex justify-between items-center mt-1">
          <div class="text-xs text-gray-500" id="${fileProgressId}-chunks">0/${totalChunks} チャンク</div>
          <div class="text-xs text-yellow-600 hidden" id="${fileProgressId}-retry"></div>
        </div>
      </div>
    `;
    fileProgressDiv.insertAdjacentHTML('beforeend', fileProgressHTML);
  }
  
  try {
    // チャンクアップロード開始（リトライ付き）
    const startResponse = await retryRequest(async () => {
      return await axios.post(`/api/subprojects/${currentSubproject}/files/chunk-start`, {
        name: fileName,
        path: filePath,
        userId: currentUser.id,
        projectId: currentProject,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
        totalChunks: totalChunks
      });
    }, 5, 1000, (retryMessage) => {
      // リトライ中の表示
      const retryDiv = document.getElementById(`${fileProgressId}-retry`);
      if (retryDiv) {
        retryDiv.textContent = retryMessage;
        retryDiv.classList.remove('hidden');
      }
    });
    
    const { fileId, r2Key } = startResponse.data;
    
    // 各チャンクをアップロード（リトライ付き）
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      // チャンクを読み込む
      const chunkData = await readChunkAsBinary(chunk);
      
      // チャンクをアップロード（リトライ付き）
      await retryRequest(async () => {
        return await axios.post(`/api/subprojects/${currentSubproject}/files/chunk-upload`, {
          fileId: fileId,
          chunkIndex: chunkIndex,
          chunkData: chunkData,
          r2Key: r2Key,
          mimeType: file.type || 'application/octet-stream'
        });
      }, 5, 1000, (retryMessage) => {
        // リトライ中の表示
        const retryDiv = document.getElementById(`${fileProgressId}-retry`);
        if (retryDiv) {
          retryDiv.textContent = retryMessage;
          retryDiv.classList.remove('hidden');
        }
      });
      
      // リトライ表示をクリア
      const retryDiv = document.getElementById(`${fileProgressId}-retry`);
      if (retryDiv) {
        retryDiv.classList.add('hidden');
      }
      
      // 進捗表示更新
      const chunkProgress = ((chunkIndex + 1) / totalChunks) * 100;
      const progressBar = document.getElementById(`${fileProgressId}-bar`);
      const progressText = document.getElementById(`${fileProgressId}-text`);
      const chunksText = document.getElementById(`${fileProgressId}-chunks`);
      
      if (progressBar) {
        progressBar.style.width = `${chunkProgress}%`;
      }
      if (progressText) {
        progressText.textContent = `${Math.round(chunkProgress)}%`;
      }
      if (chunksText) {
        chunksText.textContent = `${chunkIndex + 1}/${totalChunks} チャンク`;
      }
    }
    
    // チャンクアップロード完了（リトライ付き）
    await retryRequest(async () => {
      return await axios.post(`/api/subprojects/${currentSubproject}/files/chunk-complete`, {
        fileId: fileId,
        r2Key: r2Key,
        totalChunks: totalChunks,
        mimeType: file.type || 'application/octet-stream',
        userId: currentUser.id,
        projectId: currentProject
      });
    }, 5, 1000, (retryMessage) => {
      // リトライ中の表示
      const retryDiv = document.getElementById(`${fileProgressId}-retry`);
      if (retryDiv) {
        retryDiv.textContent = retryMessage;
        retryDiv.classList.remove('hidden');
      }
    });
    
    // リトライ表示をクリア
    const retryDiv = document.getElementById(`${fileProgressId}-retry`);
    if (retryDiv) {
      retryDiv.classList.add('hidden');
    }
    
    // 完了状態を表示
    const progressBar = document.getElementById(`${fileProgressId}-bar`);
    const progressText = document.getElementById(`${fileProgressId}-text`);
    if (progressBar) {
      progressBar.classList.remove('bg-blue-500');
      progressBar.classList.add('bg-green-500');
    }
    if (progressText) {
      progressText.textContent = '完了';
      progressText.classList.remove('text-gray-500');
      progressText.classList.add('text-green-600', 'font-semibold');
    }
  } catch (error) {
    console.error(`チャンクアップロードエラー (${fileName}):`, error);
    const progressBar = document.getElementById(`${fileProgressId}-bar`);
    const progressText = document.getElementById(`${fileProgressId}-text`);
    if (progressBar) {
      progressBar.classList.remove('bg-blue-500');
      progressBar.classList.add('bg-red-500');
    }
    if (progressText) {
      progressText.textContent = 'エラー';
      progressText.classList.remove('text-gray-500');
      progressText.classList.add('text-red-600', 'font-semibold');
    }
    throw error;
  }
}

// チャンクをバイナリ文字列として読み込む
function readChunkAsBinary(chunk) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target.result;
      const uint8Array = new Uint8Array(arrayBuffer);
      // バイナリ文字列に変換
      let binaryString = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const subChunk = uint8Array.slice(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, subChunk);
      }
      resolve(binaryString);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(chunk);
  });
}

// ファイル内容を読み込む（バイナリファイル対応、効率的な方法）
function readFileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target.result;
      // テキストファイルの場合はそのまま返す
      if (file.type.startsWith('text/') || file.type === '' || file.name.match(/\.(txt|js|json|html|css|md|py|java|cpp|c|h)$/i)) {
        resolve(result);
      } else {
        // バイナリファイルの場合はArrayBufferを文字列に変換（Base64エンコードを避ける）
        // ArrayBufferをUint8Arrayに変換してから文字列に変換
        const arrayBuffer = result;
        const uint8Array = new Uint8Array(arrayBuffer);
        // バイナリ文字列に変換（効率的）
        let binaryString = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.slice(i, i + chunkSize);
          binaryString += String.fromCharCode.apply(null, chunk);
        }
        resolve(binaryString);
      }
    };
    reader.onerror = reject;
    
    // テキストファイルとして読み取り
    if (file.type.startsWith('text/') || file.type === '' || file.name.match(/\.(txt|js|json|html|css|md|py|java|cpp|c|h)$/i)) {
      reader.readAsText(file);
    } else {
      // バイナリファイルの場合はArrayBufferとして読み取り
      reader.readAsArrayBuffer(file);
    }
  });
}

// 後方互換性のため、readFileAsTextも残す
function readFileAsText(file) {
  return readFileContent(file);
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

// ==================== ファイル種類判定 ====================

function getFileType(file) {
  const name = file.name.toLowerCase();
  const mimeType = (file.mime_type || '').toLowerCase();
  
  // フォルダ
  if (file.file_type === 'folder') {
    return 'folder';
  }
  
  // 画像系
  if (mimeType.startsWith('image/') || 
      /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(name)) {
    return 'image';
  }
  
  // 3Dモデル系
  if (mimeType.startsWith('model/') ||
      /\.(stl|blend|glb|gltf|obj|fbx|dae|3ds|max)$/i.test(name)) {
    return '3d';
  }
  
  // 動画系
  if (mimeType.startsWith('video/') ||
      /\.(mp4|webm|avi|mov|mkv|flv|wmv|m4v)$/i.test(name)) {
    return 'video';
  }
  
  // PDF
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(name)) {
    return 'pdf';
  }
  
  // テキスト系
  if (mimeType.startsWith('text/') ||
      mimeType.includes('javascript') ||
      mimeType.includes('json') ||
      mimeType.includes('xml') ||
      /\.(txt|md|html|htm|css|js|json|xml|yaml|yml|sh|bat|cmd|log|ini|conf|config|env)$/i.test(name)) {
    return 'text';
  }
  
  return 'other';
}

// ファイル種類に応じたHeroicons SVGアイコンを取得
function getFileIconSVG(file) {
  const fileType = getFileType(file);
  const iconSize = 'w-6 h-6'; // 24x24px
  
  switch (fileType) {
    case 'folder':
      return `<svg class="${iconSize} text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>`;
    case 'image':
      return `<svg class="${iconSize} text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>`;
    case 'video':
      return `<svg class="${iconSize} text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>`;
    case '3d':
      return `<svg class="${iconSize} text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>`;
    case 'text':
      return `<svg class="${iconSize} text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>`;
    default:
      return `<svg class="${iconSize} text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>`;
  }
}

// ==================== 検索・フィルタリング機能 ====================

let currentSearchQuery = '';
let currentFilters = {
  type: null,
  updatedBy: null,
  minSize: null,
  maxSize: null,
  dateFrom: null,
  dateTo: null
};

// 検索実行
async function performSearch() {
  const searchInput = document.getElementById('file-search-input');
  if (!searchInput) return;
  
  currentSearchQuery = searchInput.value.trim();
  const clearBtn = document.getElementById('clear-search-btn');
  
  if (currentSearchQuery || Object.values(currentFilters).some(v => v !== null)) {
    if (clearBtn) clearBtn.classList.remove('hidden');
    await loadFilesWithSearch();
  } else {
    if (clearBtn) clearBtn.classList.add('hidden');
    await loadFiles(currentSubproject, currentPath);
  }
}

// 検索付きファイル読み込み
async function loadFilesWithSearch() {
  if (!currentSubproject) return;
  
  try {
    const params = new URLSearchParams();
    if (currentSearchQuery) params.append('q', currentSearchQuery);
    if (currentFilters.type) params.append('type', currentFilters.type);
    if (currentFilters.updatedBy) params.append('updatedBy', currentFilters.updatedBy);
    if (currentFilters.minSize) params.append('minSize', currentFilters.minSize);
    if (currentFilters.maxSize) params.append('maxSize', currentFilters.maxSize);
    if (currentFilters.dateFrom) params.append('dateFrom', currentFilters.dateFrom);
    if (currentFilters.dateTo) params.append('dateTo', currentFilters.dateTo);
    
    const response = await axios.get(`/api/subprojects/${currentSubproject}/files/search?${params.toString()}`);
    const files = response.data;
    
    const list = document.getElementById('files-list');
    if (!list) return;
    
    let html = '';
    
    if (files.length === 0) {
      html = `
        <div class="text-center py-12 text-gray-500">
          <i class="fas fa-search text-6xl mb-4 opacity-50"></i>
          <p>検索結果が見つかりません</p>
        </div>
      `;
    } else {
      html += `
        <div class="flex items-center p-3 bg-gray-50 border-b border-gray-200">
          <input type="checkbox" id="select-all-files" onchange="toggleSelectAll()" class="w-4 h-4 text-orange border-gray-300 rounded focus:ring-orange">
          <label for="select-all-files" class="ml-2 text-sm text-gray-700 cursor-pointer">すべて選択</label>
          <span class="ml-4 text-sm text-gray-600">${files.length}件の結果</span>
        </div>
      `;
      
      html += files.map((file, index) => {
        const isFolder = file.file_type === 'folder';
        const iconSVG = getFileIconSVG(file);
        const nextPath = isFolder ? `${file.path === '/' ? '' : file.path}/${file.name}` : null;
        
        const escapedFileName = escapeHtml(file.name);
        const escapedPath = nextPath ? escapeHtml(nextPath) : '';
        const escapedFullPath = escapeHtml(file.path);
        
        return `
          <div class="flex items-center justify-between p-4 hover:bg-gray-50 ${index > 0 ? 'border-t border-gray-200' : ''}" data-file-id="${file.id}">
            <div class="flex items-center flex-1">
              <input type="checkbox" class="file-checkbox w-4 h-4 text-orange border-gray-300 rounded focus:ring-orange mr-3" data-file-id="${file.id}" data-file-name="${escapedFileName}" data-is-folder="${isFolder}" onchange="updateBulkActions()" onclick="event.stopPropagation();">
              <div class="flex items-center flex-1 ${isFolder ? 'cursor-pointer' : 'cursor-pointer'}" onclick="${isFolder ? `loadFiles(${currentSubproject}, '${escapedPath}')` : `loadAndShowFileEditor(${file.id})`}">
                <div class="mr-4 flex-shrink-0">${iconSVG}</div>
                <div class="flex-1">
                  <h4 class="font-semibold text-gray-900">${escapedFileName}</h4>
                  <p class="text-sm text-gray-600">
                    <span class="text-xs text-gray-400">${escapedFullPath}</span>
                    <span class="mx-2">•</span>
                    <i class="fas fa-user mr-1"></i>${file.updated_by_name}
                    <span class="mx-2">•</span>
                    <i class="fas fa-clock mr-1"></i>${formatDate(file.updated_at)}
                    ${!isFolder && file.file_size ? `<span class="mx-2">•</span>${formatFileSize(file.file_size)}` : ''}
                  </p>
                </div>
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
    }
    
    list.innerHTML = html;
    updateBulkActions();
  } catch (error) {
    console.error('検索エラー:', error);
    showNotification('検索に失敗しました', 'error');
  }
}

// 検索クリア
function clearSearch() {
  const searchInput = document.getElementById('file-search-input');
  if (searchInput) searchInput.value = '';
  currentSearchQuery = '';
  currentFilters = {
    type: null,
    updatedBy: null,
    minSize: null,
    maxSize: null,
    dateFrom: null,
    dateTo: null
  };
  const clearBtn = document.getElementById('clear-search-btn');
  if (clearBtn) clearBtn.classList.add('hidden');
  loadFiles(currentSubproject, currentPath);
}

// 高度な検索モーダル表示
async function showAdvancedSearchModal() {
  // ユーザー一覧を取得
  const usersResponse = await axios.get('/api/users');
  const users = usersResponse.data;
  
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-gray-900">高度な検索</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">ファイルタイプ</label>
          <select id="filter-type" class="w-full border border-gray-300 rounded-lg px-3 py-2">
            <option value="">すべて</option>
            <option value="image">画像</option>
            <option value="3d">3Dモデル</option>
            <option value="text">テキスト</option>
            <option value="video">動画</option>
            <option value="folder">フォルダ</option>
          </select>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">更新者</label>
          <select id="filter-updatedBy" class="w-full border border-gray-300 rounded-lg px-3 py-2">
            <option value="">すべて</option>
            ${users.map(u => `<option value="${u.username}">${u.username}</option>`).join('')}
          </select>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">最小サイズ (MB)</label>
            <input type="number" id="filter-minSize" class="w-full border border-gray-300 rounded-lg px-3 py-2" min="0">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">最大サイズ (MB)</label>
            <input type="number" id="filter-maxSize" class="w-full border border-gray-300 rounded-lg px-3 py-2" min="0">
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">更新日（開始）</label>
          <input type="date" id="filter-dateFrom" class="w-full border border-gray-300 rounded-lg px-3 py-2">
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">更新日（終了）</label>
          <input type="date" id="filter-dateTo" class="w-full border border-gray-300 rounded-lg px-3 py-2">
        </div>
      </div>
      
      <div class="flex justify-end space-x-2 mt-6">
        <button onclick="clearAdvancedFilters()" class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
          クリア
        </button>
        <button onclick="applyAdvancedFilters()" class="px-4 py-2 bg-orange text-white rounded-lg hover:bg-orange-dark">
          適用
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 既存のフィルタ値を設定
  const typeSelect = document.getElementById('filter-type');
  const updatedBySelect = document.getElementById('filter-updatedBy');
  const minSizeInput = document.getElementById('filter-minSize');
  const maxSizeInput = document.getElementById('filter-maxSize');
  const dateFromInput = document.getElementById('filter-dateFrom');
  const dateToInput = document.getElementById('filter-dateTo');
  
  if (typeSelect && currentFilters.type) typeSelect.value = currentFilters.type;
  if (updatedBySelect && currentFilters.updatedBy) updatedBySelect.value = currentFilters.updatedBy;
  if (minSizeInput && currentFilters.minSize) minSizeInput.value = currentFilters.minSize / (1024 * 1024);
  if (maxSizeInput && currentFilters.maxSize) maxSizeInput.value = currentFilters.maxSize / (1024 * 1024);
  if (dateFromInput && currentFilters.dateFrom) dateFromInput.value = currentFilters.dateFrom;
  if (dateToInput && currentFilters.dateTo) dateToInput.value = currentFilters.dateTo;
}

// 高度なフィルタ適用
function applyAdvancedFilters() {
  const typeSelect = document.getElementById('filter-type');
  const updatedBySelect = document.getElementById('filter-updatedBy');
  const minSizeInput = document.getElementById('filter-minSize');
  const maxSizeInput = document.getElementById('filter-maxSize');
  const dateFromInput = document.getElementById('filter-dateFrom');
  const dateToInput = document.getElementById('filter-dateTo');
  
  currentFilters.type = typeSelect?.value || null;
  currentFilters.updatedBy = updatedBySelect?.value || null;
  currentFilters.minSize = minSizeInput?.value ? parseInt(minSizeInput.value) * 1024 * 1024 : null;
  currentFilters.maxSize = maxSizeInput?.value ? parseInt(maxSizeInput.value) * 1024 * 1024 : null;
  currentFilters.dateFrom = dateFromInput?.value || null;
  currentFilters.dateTo = dateToInput?.value || null;
  
  document.querySelector('.fixed.inset-0')?.remove();
  performSearch();
}

// 高度なフィルタクリア
function clearAdvancedFilters() {
  currentFilters = {
    type: null,
    updatedBy: null,
    minSize: null,
    maxSize: null,
    dateFrom: null,
    dateTo: null
  };
  
  const typeSelect = document.getElementById('filter-type');
  const updatedBySelect = document.getElementById('filter-updatedBy');
  const minSizeInput = document.getElementById('filter-minSize');
  const maxSizeInput = document.getElementById('filter-maxSize');
  const dateFromInput = document.getElementById('filter-dateFrom');
  const dateToInput = document.getElementById('filter-dateTo');
  
  if (typeSelect) typeSelect.value = '';
  if (updatedBySelect) updatedBySelect.value = '';
  if (minSizeInput) minSizeInput.value = '';
  if (maxSizeInput) maxSizeInput.value = '';
  if (dateFromInput) dateFromInput.value = '';
  if (dateToInput) dateToInput.value = '';
}

// ==================== ドラッグ&ドロップ機能 ====================

let draggedFileId = null;
let draggedIsFolder = false;

function handleDragStart(event, fileId, isFolder) {
  draggedFileId = fileId;
  draggedIsFolder = isFolder;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', fileId.toString());
  event.currentTarget.style.opacity = '0.5';
}

function handleDragEnd(event) {
  event.currentTarget.style.opacity = '1';
  draggedFileId = null;
  draggedIsFolder = false;
}

function handleDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  event.currentTarget.classList.add('bg-blue-50');
}

function handleDragLeave(event) {
  event.currentTarget.classList.remove('bg-blue-50');
}

function handleDrop(event, targetFolderId, targetPath) {
  event.preventDefault();
  event.currentTarget.classList.remove('bg-blue-50');
  
  if (!draggedFileId) return;
  
  // フォルダにドロップする場合のみ移動
  if (targetFolderId && targetPath !== undefined) {
    moveFile(draggedFileId, targetPath);
  }
}

// ==================== 右クリックメニュー ====================

function showContextMenu(event, fileId, fileName, isFolder) {
  // 既存のメニューを削除
  const existingMenu = document.getElementById('context-menu');
  if (existingMenu) existingMenu.remove();
  
  // マウス位置を取得（clientX/Yを使用してスクロール位置を考慮）
  const x = event.clientX;
  const y = event.clientY;
  
  const menu = document.createElement('div');
  menu.id = 'context-menu';
  menu.className = 'fixed bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1';
  
  // 一時的にメニューを追加してサイズを測定
  document.body.appendChild(menu);
  menu.style.visibility = 'hidden';
  menu.innerHTML = `
    ${!isFolder ? `
      <button class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
        <i class="fas fa-eye mr-2"></i>プレビュー
      </button>
      <button class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
        <i class="fas fa-download mr-2"></i>ダウンロード
      </button>
      <button class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
        <i class="fas fa-edit mr-2"></i>名前変更
      </button>
    ` : ''}
    <button class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
      <i class="fas fa-arrows-alt mr-2"></i>移動
    </button>
    <button class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
      <i class="fas fa-copy mr-2"></i>コピー
    </button>
    <hr class="my-1">
    <button class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
      <i class="fas fa-history mr-2"></i>変更ログ
    </button>
    <hr class="my-1">
    <button class="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 text-sm">
      <i class="fas fa-trash mr-2"></i>削除
    </button>
  `;
  
  const menuRect = menu.getBoundingClientRect();
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // ウィンドウの境界をチェックして位置を調整
  let menuX = x;
  let menuY = y;
  
  // 右端にはみ出す場合
  if (x + menuRect.width > windowWidth) {
    menuX = windowWidth - menuRect.width - 10;
  }
  
  // 下端にはみ出す場合
  if (y + menuRect.height > windowHeight) {
    menuY = windowHeight - menuRect.height - 10;
  }
  
  // 左端にはみ出す場合
  if (menuX < 10) {
    menuX = 10;
  }
  
  // 上端にはみ出す場合
  if (menuY < 10) {
    menuY = 10;
  }
  
  menu.style.left = `${menuX}px`;
  menu.style.top = `${menuY}px`;
  menu.style.visibility = 'visible';
  
  // 実際のボタンにイベントを設定
  menu.innerHTML = `
    ${!isFolder ? `
      <button onclick="selectFile(${fileId}); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
        <i class="fas fa-eye mr-2"></i>プレビュー
      </button>
      <button onclick="downloadFile(${fileId}, '${escapeHtml(fileName)}'); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
        <i class="fas fa-download mr-2"></i>ダウンロード
      </button>
      <button onclick="showRenameFileModal(${fileId}, '${escapeHtml(fileName)}'); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
        <i class="fas fa-edit mr-2"></i>名前変更
      </button>
    ` : ''}
    <button onclick="showMoveFileModal(${fileId}, '${escapeHtml(fileName)}', ${isFolder}); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
      <i class="fas fa-arrows-alt mr-2"></i>移動
    </button>
    <button onclick="showCopyFileModal(${fileId}, '${escapeHtml(fileName)}', ${isFolder}); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
      <i class="fas fa-copy mr-2"></i>コピー
    </button>
    <hr class="my-1">
    <button onclick="showFileHistory(${fileId}); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
      <i class="fas fa-history mr-2"></i>変更ログ
    </button>
    <hr class="my-1">
    <button onclick="deleteFile(${fileId}, '${escapeHtml(fileName)}', ${isFolder}); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 text-sm">
      <i class="fas fa-trash mr-2"></i>削除
    </button>
  `;
  
  // メニュー外をクリックで閉じる
  setTimeout(() => {
    const closeMenuHandler = function(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenuHandler);
        document.removeEventListener('contextmenu', closeMenuHandler);
      }
    };
    document.addEventListener('click', closeMenuHandler);
    document.addEventListener('contextmenu', closeMenuHandler);
  }, 0);
}

// ファイル選択（プレビュー表示）
async function selectFile(fileId) {
  try {
    // ファイル情報を取得
    let file = null;
    if (currentSearchQuery || Object.values(currentFilters).some(v => v !== null)) {
      // 検索中の場合は検索結果から取得
      const params = new URLSearchParams();
      if (currentSearchQuery) params.append('q', currentSearchQuery);
      Object.entries(currentFilters).forEach(([key, value]) => {
        if (value !== null) params.append(key, value);
      });
      
      const searchResponse = await axios.get(`/api/subprojects/${currentSubproject}/files/search?${params.toString()}`);
      file = searchResponse.data.find(f => f.id === fileId);
    } else {
      // 通常のファイル一覧から取得
      const filesResponse = await axios.get(`/api/subprojects/${currentSubproject}/files?path=${encodeURIComponent(currentPath)}`);
      file = filesResponse.data.find(f => f.id === fileId);
    }
    
    if (!file) {
      showNotification('ファイルが見つかりません', 'error');
      return;
    }
    
    const fileType = getFileType(file);
    
    if (fileType === 'image') {
      showImagePreview(fileId);
    } else if (fileType === '3d') {
      show3DPreview(fileId);
    } else if (fileType === 'video') {
      showVideoPreview(fileId);
    } else if (fileType === 'pdf') {
      showPDFPreview(fileId);
    } else if (fileType === 'text') {
      loadAndShowFileEditor(fileId);
    } else {
      loadAndShowFileEditor(fileId);
    }
    
    // 変更ログを表示
    showFileHistory(fileId);
  } catch (error) {
    console.error('ファイル選択エラー:', error);
    showNotification('ファイルの読み込みに失敗しました', 'error');
  }
}

// ファイル移動モーダル
async function showMoveFileModal(fileId, fileName, isFolder) {
  // フォルダツリーを取得
  const response = await axios.get(`/api/subprojects/${currentSubproject}/files/all`);
  const allFiles = response.data;
  
  // フォルダのみを抽出
  const folders = allFiles.filter(f => f.file_type === 'folder');
  
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-gray-900">移動先を選択</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">移動先パス</label>
        <input type="text" id="move-target-path" value="/" class="w-full border border-gray-300 rounded-lg px-3 py-2">
        <p class="text-xs text-gray-500 mt-1">例: /folder1/folder2</p>
      </div>
      
      <div class="flex justify-end space-x-2">
        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
          キャンセル
        </button>
        <button onclick="executeMoveFile(${fileId})" class="px-4 py-2 bg-orange text-white rounded-lg hover:bg-orange-dark">
          移動
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// ファイル移動実行
async function executeMoveFile(fileId) {
  const targetPathInput = document.getElementById('move-target-path');
  if (!targetPathInput) return;
  
  const targetPath = targetPathInput.value.trim() || '/';
  
  try {
    await axios.post(`/api/files/${fileId}/move`, {
      targetPath,
      userId: currentUser.id,
      projectId: currentProject
    });
    
    showNotification('ファイルを移動しました', 'success');
    document.querySelector('.fixed.inset-0')?.remove();
    loadFiles(currentSubproject, currentPath);
  } catch (error) {
    console.error('移動エラー:', error);
    showNotification('ファイルの移動に失敗しました', 'error');
  }
}

// ファイルコピーモーダル
async function showCopyFileModal(fileId, fileName, isFolder) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-gray-900">コピー先を選択</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">新しい名前（オプション）</label>
        <input type="text" id="copy-new-name" value="${escapeHtml(fileName)}" class="w-full border border-gray-300 rounded-lg px-3 py-2">
      </div>
      
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">コピー先パス</label>
        <input type="text" id="copy-target-path" value="/" class="w-full border border-gray-300 rounded-lg px-3 py-2">
        <p class="text-xs text-gray-500 mt-1">例: /folder1/folder2</p>
      </div>
      
      <div class="flex justify-end space-x-2">
        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
          キャンセル
        </button>
        <button onclick="executeCopyFile(${fileId})" class="px-4 py-2 bg-orange text-white rounded-lg hover:bg-orange-dark">
          コピー
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// ファイルコピー実行
async function executeCopyFile(fileId) {
  const targetPathInput = document.getElementById('copy-target-path');
  const newNameInput = document.getElementById('copy-new-name');
  if (!targetPathInput || !newNameInput) return;
  
  const targetPath = targetPathInput.value.trim() || '/';
  const newName = newNameInput.value.trim();
  
  try {
    await axios.post(`/api/files/${fileId}/copy`, {
      targetPath,
      newName: newName || undefined,
      userId: currentUser.id,
      projectId: currentProject
    });
    
    showNotification('ファイルをコピーしました', 'success');
    document.querySelector('.fixed.inset-0')?.remove();
    loadFiles(currentSubproject, currentPath);
  } catch (error) {
    console.error('コピーエラー:', error);
    showNotification('ファイルのコピーに失敗しました', 'error');
  }
}

// ファイル名変更モーダル
function showRenameFileModal(fileId, currentName) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-gray-900">名前変更</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">新しい名前</label>
        <input type="text" id="rename-new-name" value="${escapeHtml(currentName)}" class="w-full border border-gray-300 rounded-lg px-3 py-2">
      </div>
      
      <div class="flex justify-end space-x-2">
        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
          キャンセル
        </button>
        <button onclick="executeRenameFile(${fileId})" class="px-4 py-2 bg-orange text-white rounded-lg hover:bg-orange-dark">
          変更
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// ファイル名変更実行
async function executeRenameFile(fileId) {
  const newNameInput = document.getElementById('rename-new-name');
  if (!newNameInput) return;
  
  const newName = newNameInput.value.trim();
  if (!newName) {
    showNotification('ファイル名を入力してください', 'error');
    return;
  }
  
  try {
    // ファイル情報を取得
    const fileResponse = await axios.get(`/api/subprojects/${currentSubproject}/files?path=${encodeURIComponent(currentPath)}`);
    const file = fileResponse.data.find(f => f.id === fileId);
    
    if (!file) {
      showNotification('ファイルが見つかりません', 'error');
      return;
    }
    
    await axios.put(`/api/files/${fileId}`, {
      name: newName,
      content: '', // 名前変更のみ
      userId: currentUser.id,
      projectId: currentProject
    });
    
    showNotification('ファイル名を変更しました', 'success');
    document.querySelector('.fixed.inset-0')?.remove();
    loadFiles(currentSubproject, currentPath);
  } catch (error) {
    console.error('名前変更エラー:', error);
    showNotification('ファイル名の変更に失敗しました', 'error');
  }
}

// ==================== プレビュー機能 ====================

// 画像プレビュー
async function showImagePreview(fileId) {
  try {
    // プレビューURLを取得
    const previewResponse = await axios.get(`/api/files/${fileId}/preview-url`);
    
    if (!previewResponse.data || !previewResponse.data.success) {
      throw new Error('プレビューURLの取得に失敗しました');
    }
    
    const previewUrl = previewResponse.data.previewUrl;
    const fileName = previewResponse.data.fileName || '画像';
    if (!previewUrl) {
      throw new Error('プレビューURLが空です');
    }
    
    // 現在のファイル一覧から前後のファイルIDを取得
    // 検索中かどうかで取得方法を変える
    let files = [];
    if (currentSearchQuery || Object.values(currentFilters).some(v => v !== null)) {
      // 検索中の場合は検索結果から取得
      const params = new URLSearchParams();
      if (currentSearchQuery) params.append('q', currentSearchQuery);
      if (currentFilters.type) params.append('type', currentFilters.type);
      else params.append('type', 'image'); // 画像のみに絞る
      
      const searchResponse = await axios.get(`/api/subprojects/${currentSubproject}/files/search?${params.toString()}`);
      files = searchResponse.data.filter(f => getFileType(f) === 'image');
    } else {
      // 通常のファイル一覧から取得
      const filesResponse = await axios.get(`/api/subprojects/${currentSubproject}/files/all`);
      files = filesResponse.data.filter(f => getFileType(f) === 'image');
    }
    
    const currentIndex = files.findIndex(f => f.id === fileId);
    const currentFile = files.find(f => f.id === fileId);
    const displayFileName = currentFile?.name || fileName;
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="relative max-w-7xl max-h-full p-4">
        <button onclick="this.closest('.fixed').remove()" class="absolute top-4 right-4 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-2">
          <i class="fas fa-times text-xl"></i>
        </button>
        ${currentIndex > 0 ? `
          <button onclick="const modal = this.closest('.fixed'); showImagePreview(${files[currentIndex - 1].id}); modal?.remove();" class="absolute left-4 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-3">
            <i class="fas fa-chevron-left"></i>
          </button>
        ` : ''}
        ${currentIndex < files.length - 1 && currentIndex >= 0 ? `
          <button onclick="const modal = this.closest('.fixed'); showImagePreview(${files[currentIndex + 1].id}); modal?.remove();" class="absolute right-4 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-3">
            <i class="fas fa-chevron-right"></i>
          </button>
        ` : ''}
        <img src="${previewUrl}" alt="${escapeHtml(displayFileName)}" class="max-w-full max-h-[90vh] object-contain" onerror="this.onerror=null; alert('画像の読み込みに失敗しました'); this.closest('.fixed')?.remove();">
        <div class="text-center text-white mt-4">
          <p class="font-semibold mb-1">${escapeHtml(displayFileName)}</p>
          <p class="text-sm opacity-75">${currentIndex >= 0 ? currentIndex + 1 : '?'} / ${files.length}</p>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
  } catch (error) {
    console.error('画像プレビューエラー:', error);
    const errorMessage = error.response?.data?.error || error.message || '画像のプレビューに失敗しました';
    showNotification(errorMessage, 'error');
  }
}

// 3Dモデルプレビュー（Three.js使用）
async function show3DPreview(fileId) {
  try {
    const previewResponse = await axios.get(`/api/files/${fileId}/preview-url`);
    
    if (!previewResponse.data || !previewResponse.data.success) {
      throw new Error('プレビューURLの取得に失敗しました');
    }
    
    const previewUrl = previewResponse.data.previewUrl;
    const fileName = previewResponse.data.fileName || '3Dモデル';
    const mimeType = previewResponse.data.mimeType || '';
    
    if (!previewUrl) {
      throw new Error('プレビューURLが空です');
    }
    
    // ファイル拡張子を取得
    const fileExt = fileName.toLowerCase().split('.').pop();
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="relative max-w-7xl max-h-full p-4 w-full h-full flex flex-col">
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-white font-semibold">${escapeHtml(fileName)}</h3>
          <button onclick="close3DPreview()" class="text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-2">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>
        <div id="threejs-container" class="flex-1 relative bg-gray-900" style="min-height: 0;">
          <div id="threejs-loading" class="absolute inset-0 flex items-center justify-center text-white">
            <div class="text-center">
              <i class="fas fa-cube text-4xl mb-2 animate-spin"></i>
              <p>読み込み中...</p>
            </div>
          </div>
        </div>
        <div class="text-white text-sm mt-2 text-center opacity-75">
          <p>マウスでドラッグ: 回転 | ホイール: ズーム | 右クリック+ドラッグ: パン</p>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Three.jsで3Dモデルを読み込む
    await load3DModel(previewUrl, fileExt, fileName);
  } catch (error) {
    console.error('3Dプレビューエラー:', error);
    const errorMessage = error.response?.data?.error || error.message || '3Dモデルのプレビューに失敗しました';
    showNotification(errorMessage, 'error');
    document.querySelector('.fixed.inset-0')?.remove();
  }
}

// Three.jsで3Dモデルを読み込む
async function load3DModel(url, fileExt, fileName) {
  const container = document.getElementById('threejs-container');
  const loadingDiv = document.getElementById('threejs-loading');
  
  if (!container) return;
  
  // シーン、カメラ、レンダラーの設定
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
  container.appendChild(renderer.domElement);
  
  // ライティング
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight1.position.set(1, 1, 1);
  scene.add(directionalLight1);
  
  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
  directionalLight2.position.set(-1, -1, -1);
  scene.add(directionalLight2);
  
  // カメラコントロール
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enableZoom = true;
  controls.enablePan = true;
  
  // モデルを読み込む
  let model = null;
  
  try {
    if (fileExt === 'stl') {
      // STL形式
      const loader = new THREE.STLLoader();
      const geometry = await new Promise((resolve, reject) => {
        loader.load(
          url,
          (geometry) => resolve(geometry),
          undefined,
          (error) => reject(error)
        );
      });
      
      const material = new THREE.MeshPhongMaterial({ 
        color: 0xcccccc,
        specular: 0x111111,
        shininess: 200
      });
      model = new THREE.Mesh(geometry, material);
      scene.add(model);
      
    } else if (fileExt === 'glb' || fileExt === 'gltf') {
      // GLB/GLTF形式
      const loader = new THREE.GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.load(
          url,
          (gltf) => resolve(gltf),
          undefined,
          (error) => reject(error)
        );
      });
      
      model = gltf.scene;
      scene.add(model);
      
    } else if (fileExt === 'obj') {
      // OBJ形式
      const loader = new THREE.OBJLoader();
      model = await new Promise((resolve, reject) => {
        loader.load(
          url,
          (object) => resolve(object),
          undefined,
          (error) => reject(error)
        );
      });
      
      // OBJファイルにはマテリアルがない場合があるので、デフォルトマテリアルを適用
      model.traverse((child) => {
        if (child.isMesh) {
          if (!child.material) {
            child.material = new THREE.MeshPhongMaterial({ 
              color: 0xcccccc,
              specular: 0x111111,
              shininess: 200
            });
          }
        }
      });
      
      scene.add(model);
      
    } else {
      throw new Error(`未対応のファイル形式です: .${fileExt}`);
    }
    
    // モデルの中心とサイズを計算してカメラを配置
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    // モデルを原点に移動
    model.position.sub(center);
    
    // カメラを適切な位置に配置
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5; // 少し離す
    
    camera.position.set(cameraZ, cameraZ, cameraZ);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    
    // 読み込み完了
    if (loadingDiv) loadingDiv.style.display = 'none';
    
    // アニメーションループ
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();
    
    // リサイズハンドラー
    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);
    
    // モーダルが閉じられたときにクリーンアップ
    const modal = container.closest('.fixed');
    if (modal) {
      const observer = new MutationObserver(() => {
        if (!document.body.contains(modal)) {
          window.removeEventListener('resize', handleResize);
          renderer.dispose();
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true });
    }
    
  } catch (error) {
    console.error('3Dモデル読み込みエラー:', error);
    if (loadingDiv) {
      loadingDiv.innerHTML = `
        <div class="text-center text-red-400">
          <i class="fas fa-exclamation-triangle text-4xl mb-2"></i>
          <p>読み込みに失敗しました</p>
          <p class="text-sm mt-2">${error.message || 'エラーが発生しました'}</p>
        </div>
      `;
    }
    showNotification('3Dモデルの読み込みに失敗しました', 'error');
  }
}

// 3Dプレビューを閉じる
function close3DPreview() {
  const modal = document.querySelector('.fixed.inset-0');
  if (modal) {
    // Three.jsのリソースをクリーンアップ
    const container = document.getElementById('threejs-container');
    if (container) {
      const canvas = container.querySelector('canvas');
      if (canvas) {
        const gl = canvas.getContext('webgl');
        if (gl) {
          const loseContext = gl.getExtension('WEBGL_lose_context');
          if (loseContext) {
            loseContext.loseContext();
          }
        }
      }
      container.innerHTML = '';
    }
    modal.remove();
  }
}

// 動画プレビュー
async function showPDFPreview(fileId) {
  try {
    const response = await axios.get(`/api/files/${fileId}/preview-url`);
    
    if (!response.data.success || !response.data.previewUrl) {
      showNotification('PDFプレビューの取得に失敗しました', 'error');
      return;
    }
    
    const previewUrl = response.data.previewUrl;
    const fileName = response.data.fileName || 'ファイル';
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between p-4 border-b">
          <h3 class="text-lg font-semibold">${escapeHtml(fileName)}</h3>
          <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>
        <div class="flex-1 overflow-auto p-4">
          <iframe src="${previewUrl}" class="w-full h-full min-h-[600px] border-0" style="min-height: 80vh;"></iframe>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // モーダル外クリックで閉じる
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    // ESCキーで閉じる
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        modal.remove();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  } catch (error) {
    console.error('PDFプレビューエラー:', error);
    showNotification('PDFプレビューの表示に失敗しました', 'error');
  }
}

async function showVideoPreview(fileId) {
  try {
    const previewResponse = await axios.get(`/api/files/${fileId}/preview-url`);
    
    if (!previewResponse.data || !previewResponse.data.success) {
      throw new Error('プレビューURLの取得に失敗しました');
    }
    
    const previewUrl = previewResponse.data.previewUrl;
    const fileName = previewResponse.data.fileName || '動画';
    const mimeType = previewResponse.data.mimeType || 'video/mp4';
    
    if (!previewUrl) {
      throw new Error('プレビューURLが空です');
    }
    
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="relative max-w-7xl max-h-full p-4 flex flex-col">
        <div class="flex justify-between items-center mb-2">
          <h3 class="text-white font-semibold">${escapeHtml(fileName)}</h3>
          <button onclick="this.closest('.fixed').remove()" class="text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-2">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>
        <video src="${previewUrl}" controls class="max-w-full max-h-[90vh]" type="${mimeType}" onerror="this.onerror=null; alert('動画の読み込みに失敗しました'); this.closest('.fixed')?.remove();">
          お使いのブラウザは動画タグをサポートしていません。
        </video>
      </div>
    `;
    
    document.body.appendChild(modal);
  } catch (error) {
    console.error('動画プレビューエラー:', error);
    const errorMessage = error.response?.data?.error || error.message || '動画のプレビューに失敗しました';
    showNotification(errorMessage, 'error');
  }
}

// ==================== ファイル変更ログサイドバー ====================

async function showFileHistory(fileId) {
  const sidebar = document.getElementById('file-history-sidebar');
  if (!sidebar) return;
  
  sidebar.classList.remove('hidden');
  const content = document.getElementById('file-history-content');
  if (!content) return;
  
  content.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> 読み込み中...</div>';
  
  try {
    const [historyResponse, versionsResponse] = await Promise.all([
      axios.get(`/api/files/${fileId}/history`),
      axios.get(`/api/files/${fileId}/versions`).catch(() => ({ data: [] }))
    ]);
    
    const history = historyResponse.data;
    const versions = versionsResponse.data || [];
    
    if (history.length === 0 && versions.length === 0) {
      content.innerHTML = '<div class="text-center py-4 text-gray-500">変更履歴がありません</div>';
      return;
    }
    
    let html = '<div class="space-y-4">';
    
    // バージョン履歴セクション
    if (versions.length > 0) {
      html += '<div class="mb-4"><h3 class="font-semibold text-sm mb-2 text-gray-700">バージョン履歴</h3><div class="space-y-2">';
      versions.forEach(version => {
        html += `
          <div class="border border-gray-200 rounded p-3 bg-gray-50">
            <div class="flex items-center justify-between mb-2">
              <span class="font-semibold text-sm">バージョン ${version.version}</span>
              <span class="text-xs text-gray-500">${formatDate(version.created_at)}</span>
            </div>
            <div class="text-xs text-gray-600 mb-2">
              <div><i class="fas fa-user mr-1"></i>${version.created_by_name || '不明'}</div>
              <div><i class="fas fa-file mr-1"></i>${(version.file_size / 1024).toFixed(2)} KB</div>
            </div>
            <button onclick="restoreFileVersion(${fileId}, ${version.id})" class="mt-2 w-full bg-blue-500 text-white text-xs py-1 px-3 rounded hover:bg-blue-600 transition">
              このバージョンに復元
            </button>
          </div>
        `;
      });
      html += '</div></div>';
    }
    
    // 変更ログセクション
    if (history.length > 0) {
      html += '<div><h3 class="font-semibold text-sm mb-2 text-gray-700">変更ログ</h3><div class="space-y-3">';
      history.forEach(item => {
        const actionIcon = item.action === 'created' ? 'fa-plus text-green-500' : 
                          item.action === 'updated' ? 'fa-edit text-blue-500' : 
                          'fa-trash text-red-500';
        const actionText = item.action === 'created' ? '作成' : 
                          item.action === 'updated' ? '更新' : 
                          '削除';
        
        html += `
          <div class="border-l-2 border-gray-200 pl-4 py-2">
            <div class="flex items-center mb-1">
              <i class="fas ${actionIcon} mr-2"></i>
              <span class="font-semibold text-sm">${actionText}</span>
              <span class="ml-auto text-xs text-gray-500">${formatDate(item.created_at)}</span>
            </div>
            <div class="text-sm text-gray-600">
              <div class="mb-1">
                <i class="fas fa-user mr-1"></i>${item.username}
              </div>
              ${item.description ? `<div class="text-xs text-gray-500">${escapeHtml(item.description)}</div>` : ''}
            </div>
          </div>
        `;
      });
      html += '</div></div>';
    }
    
    html += '</div>';
    
    content.innerHTML = html;
  } catch (error) {
    console.error('変更ログ取得エラー:', error);
    content.innerHTML = '<div class="text-center py-4 text-red-500">変更ログの取得に失敗しました</div>';
  }
}

// ファイルバージョン復元
async function restoreFileVersion(fileId, versionId) {
  if (!confirm('このバージョンに復元しますか？現在のバージョンは履歴に保存されます。')) {
    return;
  }
  
  try {
    await axios.post(`/api/files/${fileId}/restore`, {
      versionId,
      userId: currentUser.id,
      projectId: currentProject
    });
    
    showNotification('ファイルを復元しました', 'success');
    loadFiles(currentSubproject, currentPath);
    showFileHistory(fileId);
  } catch (error) {
    console.error('復元エラー:', error);
    showNotification('ファイルの復元に失敗しました', 'error');
  }
}

function closeFileHistorySidebar() {
  const sidebar = document.getElementById('file-history-sidebar');
  if (sidebar) sidebar.classList.add('hidden');
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
