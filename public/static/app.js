let currentUser = null;
let currentProject = null;
let currentProjectName = null;
let currentSubproject = null;
let currentSubprojectName = null;
let currentPath = '/'; // 現在のパス
let currentSubprojectSort = 'display_order';
let currentSubprojectSortOrder = 'asc';
let currentFileSort = 'default';
let currentFileSortOrder = 'asc';

// ==================== ユーティリティ関数 ====================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeJsString(value) {
  // onclick="... 'HERE' ..." に安全に埋め込むための最低限のエスケープ
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

function isGuestMode() {
  return !!(currentUser && currentUser.isGuest);
}

function ensureNotGuest(actionLabel) {
  if (isGuestMode()) {
    showNotification(`ゲストでは${actionLabel}できません`, 'error');
    return false;
  }
  return true;
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
          <p class="mt-2 text-gray-600">ばーちゃるず プロジェクト管理ツール</p>
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

          <div class="relative flex items-center py-2">
            <div class="flex-grow border-t border-gray-300"></div>
            <span class="flex-shrink mx-4 text-gray-400 text-sm">または</span>
            <div class="flex-grow border-t border-gray-300"></div>
          </div>

          <button onclick="handleGuestLogin()" class="w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-200 transition border border-gray-300">
            <i class="fas fa-user-secret mr-2"></i>ゲストとしてログイン
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

function handleGuestLogin() {
  currentUser = { id: 'guest', username: 'guest', isGuest: true };
  localStorage.setItem('user', JSON.stringify(currentUser));
  showNotification('ゲストでログインしました', 'info');
  showProjectsPage();
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
  const guest = isGuestMode();
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
          ${guest ? `
          <div class="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
            ゲストログインではパスワードを変更できません。
          </div>
          ` : `
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
          `}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

async function updatePassword() {
  if (!ensureNotGuest('パスワードを変更')) return;

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
      ${isGuestMode() ? '' : `
      <div class="mb-6 relative">
        <div class="flex items-center bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm max-w-2xl">
          <i class="fas fa-search text-gray-400 mr-2"></i>
          <input type="text" id="global-file-search-input" placeholder="ファイル名で全体検索..." class="flex-1 outline-none py-1" oninput="onGlobalFileSearchInput()">
        </div>
        <div id="global-file-search-results" class="hidden absolute top-full left-0 mt-1 w-full max-w-2xl bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto"></div>
      </div>
      `}
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-gray-900">${isGuestMode() ? '閲覧可能プロジェクト一覧' : 'プロジェクト一覧'}</h2>
        <div class="flex space-x-2">
          ${currentUser.username === 'admin' ? `
          <button onclick="showAdminSharesPage()" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition">
            <i class="fas fa-share-alt mr-2"></i>共有リンク管理
          </button>
          <button onclick="showMemberManagementModal()" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition">
            <i class="fas fa-users mr-2"></i>メンバー管理
          </button>
          ` : ''}
          <button onclick="showAssignedProjectsPage()" class="bg-white border border-orange text-orange px-4 py-2 rounded-lg hover:bg-orange hover:text-white transition">
            <i class="fas fa-list mr-2"></i>担当プロジェクト一覧
          </button>
          ${isGuestMode() ? '' : `
          <button onclick="showChangelogPage()" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 hover:text-orange transition">
            <i class="fas fa-history mr-2"></i>変更ログ
          </button>
          <button onclick="showCreateProjectModal()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark transition">
            <i class="fas fa-plus mr-2"></i>新規プロジェクト
          </button>
          `}
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

  if (!isGuestMode()) {
    setupGlobalFileSearch();
  }
}

let globalFileSearchDebounceTimer = null;

/** トップページのファイル全体検索入力時のデバウンス検索 */
function onGlobalFileSearchInput() {
  clearTimeout(globalFileSearchDebounceTimer);
  const input = document.getElementById('global-file-search-input');
  const resultsEl = document.getElementById('global-file-search-results');
  if (!input || !resultsEl) return;
  const q = (input.value || '').trim();
  if (!q) {
    resultsEl.classList.add('hidden');
    resultsEl.innerHTML = '';
    return;
  }
  globalFileSearchDebounceTimer = setTimeout(() => performGlobalFileSearch(q), 200);
}

/** トップページ用のファイル全体検索を実行し結果を表示 */
async function performGlobalFileSearch(q) {
  const resultsEl = document.getElementById('global-file-search-results');
  if (!resultsEl) return;
  resultsEl.classList.remove('hidden');
  resultsEl.innerHTML = '<div class="p-4 text-gray-500 text-sm">検索中...</div>';
  try {
    const response = await axios.get('/api/files/search', {
      params: { q, userId: currentUser.id }
    });
    const files = response.data || [];
    if (files.length === 0) {
      resultsEl.innerHTML = '<div class="p-4 text-gray-500 text-sm">該当するファイルがありません</div>';
      return;
    }
    resultsEl.innerHTML = files.map((f) => {
      const dirLabel = f.path === '/' ? '' : ` (${f.path})`;
      const label = `${escapeHtml(f.name)} — ${escapeHtml(f.project_name || '')} / ${escapeHtml(f.subproject_name || '')}${dirLabel}`;
      const pathArg = escapeJsString(f.path || '/');
      return `<div class="px-4 py-2 hover:bg-orange-50 cursor-pointer border-b border-gray-100 last:border-0" onclick="navigateToFileResult('${escapeJsString(f.project_id)}', '${escapeJsString(f.subproject_id)}', '${pathArg}')">${label}</div>`;
    }).join('');
  } catch (err) {
    console.error('ファイル検索エラー:', err);
    resultsEl.innerHTML = '<div class="p-4 text-red-600 text-sm">検索に失敗しました</div>';
  }
}

/** 検索結果のファイルをクリックしたとき、そのプロジェクト・子プロジェクトのディレクトリへ遷移 */
function navigateToFileResult(projectId, subprojectId, initialPath) {
  const resultsEl = document.getElementById('global-file-search-results');
  if (resultsEl) {
    resultsEl.classList.add('hidden');
    resultsEl.innerHTML = '';
  }
  const input = document.getElementById('global-file-search-input');
  if (input) input.value = '';
  showSubprojectPage(projectId, subprojectId, initialPath || '/');
}

let globalFileSearchClickBound = false;

/** トップページのファイル検索: 結果外クリックでドロップダウンを閉じる */
function setupGlobalFileSearch() {
  if (globalFileSearchClickBound) return;
  globalFileSearchClickBound = true;
  document.addEventListener('click', (e) => {
    const resultsEl = document.getElementById('global-file-search-results');
    const input = document.getElementById('global-file-search-input');
    if (!resultsEl || !input) return;
    if (resultsEl.classList.contains('hidden')) return;
    if (resultsEl.contains(e.target) || input.contains(e.target)) return;
    resultsEl.classList.add('hidden');
  });
}

async function loadProjects() {
  try {
    const response = await axios.get(`/api/projects`);
    let projects = response.data.map(p => ({
      ...p,
      guestVisible: p.guest_visible === 1 || p.guest_visible === true
    }));

    if (isGuestMode()) {
      projects = projects.filter(p => p.guestVisible);
    }

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

    projectsList.innerHTML = projects.map((project, index) => `
      <div 
        class="relative bg-white border border-gray-200 rounded-lg p-6 hover:border-orange transition cursor-pointer project-card" 
        onclick="showProjectPage('${escapeJsString(project.id)}')"
      >
        ${currentUser.username === 'admin' ? `
        <div class="absolute top-1 left-2 flex">
          <button 
            onclick="event.stopPropagation(); moveProject('${escapeJsString(project.id)}', 'left')" 
            class="p-2 text-sm text-gray-400 hover:text-orange transition-colors"
            title="左に移動"
          >
            <i class="fas fa-arrow-left"></i>
          </button>
          <button 
            onclick="event.stopPropagation(); moveProject('${escapeJsString(project.id)}', 'right')" 
            class="p-2 text-sm text-gray-400 hover:text-orange transition-colors"
            title="右に移動"
          >
            <i class="fas fa-arrow-right"></i>
          </button>
        </div>
        ` : ''}
        ${currentUser.username === 'admin' ? `
        <div class="absolute top-1 right-2 flex items-center space-x-2">
          <span class="text-xs px-2 py-1 rounded-full ${project.guestVisible ? 'bg-green-50 text-green-700 border border-green-300' : 'bg-gray-100 text-gray-600 border border-gray-200'}">
            ゲスト${project.guestVisible ? '公開中' : '非公開'}
          </span>
          <button 
            onclick="event.stopPropagation(); toggleGuestVisibility('${escapeJsString(project.id)}', ${project.guestVisible})" 
            class="p-2 text-sm ${project.guestVisible ? 'text-green-600 hover:text-green-700' : 'text-gray-500 hover:text-gray-700'} transition-colors border rounded"
            title="ゲスト閲覧可否を切り替え"
          >
            <i class="fas ${project.guestVisible ? 'fa-eye' : 'fa-eye-slash'}"></i>
          </button>
        </div>
        ` : ''}
        <h3 class="text-xl font-bold text-gray-900 mb-2 mt-4">${project.name}</h3>
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



async function moveProject(projectId, direction) {
  if (!ensureNotGuest('プロジェクトの並び替え')) return;

  try {
    await axios.put(`/api/projects/${projectId}/move`, {
      direction,
      userId: currentUser.id
    });
    await loadProjects();
    showNotification('並び順を保存しました', 'success');
  } catch (error) {
    console.error('プロジェクト並び替えエラー:', error);
    showNotification('並び順の保存に失敗しました', 'error');
  }
}

async function toggleGuestVisibility(projectId, currentVisible) {
  if (!ensureNotGuest('ゲスト公開設定の変更')) return;

  try {
    await axios.put(`/api/projects/${projectId}/guest-visible`, {
      userId: currentUser.id,
      guestVisible: !currentVisible
    });
    await loadProjects();
    showNotification(`ゲスト公開を${!currentVisible ? '有効化' : '無効化'}しました`, 'success');
  } catch (error) {
    console.error('ゲスト公開切り替えエラー:', error);
    showNotification('ゲスト公開設定の変更に失敗しました', 'error');
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
        <div class="bg-white border border-gray-200 rounded-lg p-3 text-sm cursor-pointer hover:border-orange transition" onclick="showProjectPage('${escapeJsString(item.project_id)}')">
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

/** 変更ログ一覧ページを表示（ゲスト以外用） */
async function showChangelogPage() {
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader()}
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-gray-900">変更ログ一覧</h2>
        <button onclick="showProjectsPage()" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 hover:text-orange transition">
          <i class="fas fa-arrow-left mr-2"></i>プロジェクト一覧
        </button>
      </div>

      <div class="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <h3 class="text-sm font-semibold text-gray-700 mb-3">絞り込み</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">ユーザー</label>
            <select id="changelog-user" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange">
              <option value="">すべて</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">プロジェクト</label>
            <select id="changelog-project" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange">
              <option value="">すべて</option>
            </select>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="loadChangelogList()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark transition text-sm">
              <i class="fas fa-search mr-1"></i>表示
            </button>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end mt-4">
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">日時 開始</label>
            <input type="date" id="changelog-date-from" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange">
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 mb-1">日時 終了</label>
            <input type="date" id="changelog-date-to" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange">
          </div>
        </div>
      </div>

      <div id="changelog-list" class="space-y-3">
        <div class="text-center py-8 text-gray-500 bg-white border border-gray-200 rounded-lg">読み込み中...</div>
      </div>
    </div>

    <div id="changelog-range-bar" class="fixed bottom-6 right-6 z-50 flex items-center gap-2 text-sm bg-white border border-gray-300 rounded-lg shadow-lg px-3 py-2" aria-label="読み込み範囲">
      <button type="button" onclick="changelogRangePrev()" class="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 text-gray-700" title="前の範囲">&lt;</button>
      <span class="flex items-center gap-1">
        <input type="number" id="changelog-range-start" min="1" value="1" class="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm focus:outline-none focus:border-orange" onkeydown="if(event.key==='Enter')applyChangelogRange()">
        <span class="text-gray-500">~</span>
        <input type="number" id="changelog-range-end" min="1" value="100" class="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm focus:outline-none focus:border-orange" onkeydown="if(event.key==='Enter')applyChangelogRange()">
      </span>
      <button type="button" onclick="changelogRangeNext()" class="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 text-gray-700" title="次の範囲">&gt;</button>
    </div>
  `;

  await loadChangelogFilters();
  await loadChangelogList();
}

/** 範囲入力の [開始] ~ [終了] を適用して再読み込み */
function applyChangelogRange() {
  const startInput = document.getElementById('changelog-range-start');
  const endInput = document.getElementById('changelog-range-end');
  if (!startInput || !endInput) return;
  let start = parseInt(startInput.value, 10) || 1;
  let end = parseInt(endInput.value, 10) || 1;
  if (start < 1) start = 1;
  if (end < start) end = start;
  startInput.value = String(start);
  endInput.value = String(end);
  loadChangelogList();
}

/** 範囲を前にずらして再読み込み */
function changelogRangePrev() {
  const startInput = document.getElementById('changelog-range-start');
  const endInput = document.getElementById('changelog-range-end');
  if (!startInput || !endInput) return;
  let start = parseInt(startInput.value, 10) || 1;
  let end = parseInt(endInput.value, 10) || 1;
  const pageSize = Math.max(1, end - start + 1);
  const newStart = Math.max(1, start - pageSize);
  const newEnd = newStart + pageSize - 1;
  startInput.value = String(newStart);
  endInput.value = String(newEnd);
  applyChangelogRange();
}

/** 範囲を次にずらして再読み込み */
function changelogRangeNext() {
  const startInput = document.getElementById('changelog-range-start');
  const endInput = document.getElementById('changelog-range-end');
  if (!startInput || !endInput) return;
  let start = parseInt(startInput.value, 10) || 1;
  let end = parseInt(endInput.value, 10) || 1;
  const pageSize = Math.max(1, end - start + 1);
  const newStart = end + 1;
  const newEnd = newStart + pageSize - 1;
  startInput.value = String(newStart);
  endInput.value = String(newEnd);
  applyChangelogRange();
}

/** 変更ログのユーザー・プロジェクトの選択肢を取得してセレクトを埋める */
async function loadChangelogFilters() {
  try {
    const [usersRes, projectsRes] = await Promise.all([
      axios.get('/api/users'),
      axios.get('/api/projects')
    ]);
    const userSelect = document.getElementById('changelog-user');
    const projectSelect = document.getElementById('changelog-project');
    if (!userSelect || !projectSelect) return;

    const users = usersRes.data || [];
    let projects = projectsRes.data || [];
    if (isGuestMode()) {
      projects = projects.filter(p => p.guest_visible === 1 || p.guest_visible === true);
    }

    userSelect.innerHTML = '<option value="">すべて</option>' + users.map(u =>
      `<option value="${escapeHtml(u.id)}">${escapeHtml(u.username)}</option>`
    ).join('');
    projectSelect.innerHTML = '<option value="">すべて</option>' + projects.map(p =>
      `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`
    ).join('');
  } catch (e) {
    console.error('変更ログ絞り込み用データ取得エラー:', e);
  }
}

/** 現在の絞り込み条件で変更ログ一覧を再取得して表示 */
async function loadChangelogList() {
  const listEl = document.getElementById('changelog-list');
  if (!listEl) return;

  const startInput = document.getElementById('changelog-range-start');
  const endInput = document.getElementById('changelog-range-end');
  let start = parseInt(startInput?.value || '1', 10) || 1;
  let end = parseInt(endInput?.value || '100', 10) || 100;
  if (start < 1) start = 1;
  if (end < start) end = start;
  const offset = start - 1;
  const limit = end - start + 1;
  const userId = document.getElementById('changelog-user')?.value || '';
  const projectId = document.getElementById('changelog-project')?.value || '';
  const dateFrom = document.getElementById('changelog-date-from')?.value || '';
  const dateTo = document.getElementById('changelog-date-to')?.value || '';

  listEl.innerHTML = '<div class="text-center py-8 text-gray-500 bg-white border border-gray-200 rounded-lg">読み込み中...</div>';

  try {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (userId) params.set('userId', userId);
    if (projectId) params.set('projectId', projectId);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    const response = await axios.get(`/api/timeline/recent?${params.toString()}`);
    const timeline = response.data;

    if (timeline.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-12 text-gray-500 bg-white border border-gray-200 rounded-lg">
          <i class="fas fa-history text-4xl mb-4 opacity-50"></i>
          <p>条件に一致するアクティビティがありません</p>
        </div>
      `;
      const startInput = document.getElementById('changelog-range-start');
      const endInput = document.getElementById('changelog-range-end');
      if (startInput && endInput) {
        startInput.value = String(offset + 1);
        endInput.value = String(offset + limit);
      }
      return;
    }

    const iconMap = {
      created: 'fa-plus-circle text-green-500',
      updated: 'fa-edit text-blue-500',
      deleted: 'fa-trash text-red-500'
    };

    listEl.innerHTML = timeline.map(item => `
      <div class="bg-white border border-gray-200 rounded-lg p-3 text-sm cursor-pointer hover:border-orange transition" onclick="showProjectPage('${escapeJsString(item.project_id)}')">
        <div class="flex items-start space-x-2">
          <i class="fas ${iconMap[item.action] || 'fa-circle'} mt-1"></i>
          <div class="flex-1">
            <p class="text-gray-900">
              <span class="font-semibold">${escapeHtml(item.username)}</span>
              <span class="text-gray-600">${escapeHtml(item.description || '')}</span>
            </p>
            <p class="text-xs text-gray-500 mt-1">
              <span class="text-orange font-medium">${escapeHtml(item.project_name || '')}</span>
              <span class="mx-1">•</span>
              ${formatDate(item.created_at)}
            </p>
          </div>
        </div>
      </div>
    `).join('');

    const startInput = document.getElementById('changelog-range-start');
    const endInput = document.getElementById('changelog-range-end');
    if (startInput && endInput) {
      startInput.value = String(offset + 1);
      endInput.value = String(offset + limit);
    }
  } catch (error) {
    console.error('変更ログ取得エラー:', error);
    listEl.innerHTML = `
      <div class="text-center py-12 text-red-500 bg-white border border-gray-200 rounded-lg">
        <p>変更ログの取得に失敗しました</p>
      </div>
    `;
  }
}

// ==================== 担当プロジェクト一覧 ====================

function showAssignedProjectsPage() {
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader()}
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">担当プロジェクト一覧</h2>
          <p class="text-sm text-gray-600 mt-1">各メンバーの進行中 / 未進行プロジェクトを確認します</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="showProjectsPage()" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:border-orange hover:text-orange transition">
            <i class="fas fa-arrow-left mr-2"></i>プロジェクト一覧
          </button>
          <button onclick="showAchievedAssignedProjectsPage()" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:border-orange hover:text-orange transition">
            <i class="fas fa-trophy mr-2"></i>達成済みプロジェクト一覧
          </button>
        </div>
      </div>
      <div id="member-projects-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="col-span-full text-center py-10 text-gray-500 bg-white border border-gray-200 rounded-lg">読み込み中...</div>
      </div>
    </div>
  `;

  loadMemberProjects();
}

async function loadMemberProjects() {
  const container = document.getElementById('member-projects-container');
  if (!container) return;

  container.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500 bg-white border border-gray-200 rounded-lg">読み込み中...</div>';

  try {
    const response = await axios.get(`/api/member-projects?requesterId=${currentUser.id}`);
    const users = response.data || [];

    if (users.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12 text-gray-500 bg-white border border-gray-200 rounded-lg">
          <i class="fas fa-users-slash text-5xl mb-4 opacity-40"></i>
          <p class="font-semibold">メンバーが見つかりません</p>
        </div>
      `;
      return;
    }

    const cards = users.map((user) => {
      const userProjects = user.projects || [];
      const inProgress = userProjects.filter(p => p.status === 'in_progress');
      const pending = userProjects.filter(p => p.status === 'pending');
      const canManage = currentUser.username === 'admin' || user.id === currentUser.id;

      const renderLane = (label, count, projects, colorClass, textClass = '') => {
        const blocks = projects.length > 0
          ? projects.map(p => renderMemberProjectBlock(p, colorClass, textClass, canManage)).join('')
          : '<div class="text-xs text-gray-400 px-2 py-2 italic">なし</div>';
        return `
          <div class="mb-2 last:mb-0">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-bold text-gray-600">${label}</span>
              <span class="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">${count}</span>
            </div>
            <div class="overflow-x-auto custom-scrollbar pb-1">
              <div class="flex space-x-2 min-w-max">${blocks}</div>
            </div>
          </div>
        `;
      };

      return `
        <div class="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition duration-200 flex flex-col h-full">
          <div class="flex items-center justify-between mb-2 border-b border-gray-100 pb-2">
            <div class="min-w-0 flex-1 mr-2">
              <div class="flex items-center">
                <div class="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center mr-2 flex-shrink-0">
                  <i class="fas fa-user text-xs text-gray-400"></i>
                </div>
                <h3 class="text-sm font-bold text-gray-900 truncate" title="${escapeHtml(user.username)}">${escapeHtml(user.username)}</h3>
              </div>
            </div>
            ${canManage ? `
            <button onclick="openMemberProjectModal('create', '', '${escapeJsString(user.id)}', '', 'pending', '', '')" class="text-orange hover:bg-orange-50 p-1.5 rounded transition" title="プロジェクト追加">
              <i class="fas fa-plus text-sm"></i>
            </button>
            ` : ''}
          </div>
          <div class="flex-1 space-y-2">
            ${renderLane('進行中', inProgress.length, inProgress, 'bg-green-50 border-green-600', 'text-green-900')}
            ${renderLane('未進行', pending.length, pending, 'bg-yellow-50 border-yellow-400', 'text-yellow-900')}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = cards;
  } catch (error) {
    console.error('担当プロジェクト取得エラー:', error);
    container.innerHTML = `
      <div class="text-center py-12 text-red-500 bg-white border border-red-200 rounded-lg">
        担当プロジェクトの取得に失敗しました
      </div>
    `;
  }
}

function renderMemberProjectBlock(project, colorClass, textClass, canManage) {
  let subLabel = '';
  if (project.subproject_name && project.subproject_id && project.parent_project_id) {
    // リンク可能な場合
    subLabel = `<p class="text-[10px] text-blue-600 hover:text-blue-800 mt-1 truncate cursor-pointer underline" title="クリックして ${escapeHtml(project.project_name || '')} / ${escapeHtml(project.subproject_name)} を開く" onclick="event.stopPropagation(); showSubprojectPage('${escapeJsString(project.parent_project_id)}', '${escapeJsString(project.subproject_id)}')"><i class="fas fa-folder-open mr-1"></i>${escapeHtml(project.project_name || '')} / ${escapeHtml(project.subproject_name)}</p>`;
  } else if (project.subproject_name) {
    // リンク不可（情報不足）の場合
    subLabel = `<p class="text-[10px] text-gray-600 mt-1 truncate" title="${escapeHtml(project.project_name || '')} / ${escapeHtml(project.subproject_name)}"><i class="fas fa-folder-open mr-1"></i>${escapeHtml(project.project_name || '')} / ${escapeHtml(project.subproject_name)}</p>`;
  }

  const dueDateStr = project.due_date ? project.due_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3') : '未定';
  const dueLabel = `<p class="text-[10px] mt-0.5 opacity-90"><i class="fas fa-calendar-alt mr-1"></i>納期: ${escapeHtml(dueDateStr)}</p>`;

  return `
    <div class="min-w-[140px] max-w-[140px] rounded p-2 shadow-sm border hover:shadow transition ${colorClass} ${textClass}">
      <div class="flex flex-col h-full justify-between gap-1">
        <div>
          <p class="font-bold text-xs truncate leading-tight" title="${escapeHtml(project.title)}">${escapeHtml(project.title)}</p>
          ${subLabel}
          ${dueLabel}
        </div>
        ${canManage ? `
        <div class="flex items-center justify-end flex-wrap gap-0.5 pt-1 border-t border-black/5 mt-1">
          <button onclick="openMemberProjectModal('edit', '${escapeJsString(project.id)}', '${escapeJsString(project.user_id)}', '${escapeJsString(project.title)}', '${project.status}', '${project.subproject_id || ''}', '${escapeJsString(project.due_date || '')}')" class="p-0.5 rounded hover:bg-black/10 transition text-gray-600" title="編集">
            <i class="fas fa-pen text-[10px]"></i>
          </button>
          <button onclick="achieveMemberProject('${escapeJsString(project.id)}')" class="p-0.5 rounded hover:bg-black/10 transition text-amber-600" title="達成">
            <i class="fas fa-check text-[10px]"></i>
          </button>
          <button onclick="deleteMemberProject('${escapeJsString(project.id)}')" class="p-0.5 rounded hover:bg-black/10 transition text-red-500" title="削除">
            <i class="fas fa-times text-[10px]"></i>
          </button>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

function openMemberProjectModal(mode, projectId = '', userId = '', title = '', status = 'pending', subprojectId = '', dueDate = '') {
  if (!ensureNotGuest('担当プロジェクトを編集')) return;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';

  // 選択済み子プロジェクト情報を一時的に保存
  modal.dataset.selectedSubprojectId = subprojectId || '';
  modal.dataset.selectedSubprojectName = '';
  modal.dataset.selectedProjectName = '';

  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 w-full max-w-md" data-role="member-project-modal" data-mode="${mode}" data-project-id="${projectId}" data-user-id="${userId}">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-xl font-bold">${mode === 'create' ? '担当プロジェクトを追加' : '担当プロジェクトを編集'}</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times text-lg"></i>
        </button>
      </div>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">タイトル</label>
          <input name="member-project-title" type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" value="${escapeHtml(title)}" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">納期</label>
          <input name="member-project-due-date" type="date" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" value="${escapeHtml(dueDate)}" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">状態</label>
          <select name="member-project-status" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange">
            <option value="in_progress" ${status === 'in_progress' ? 'selected' : ''}>進行中</option>
            <option value="pending" ${status === 'pending' ? 'selected' : ''}>未進行</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">子プロジェクト先</label>
          <div class="flex items-center space-x-2">
            <div class="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm" data-role="subproject-display">
              <span data-role="subproject-text" class="text-gray-500">読み込み中...</span>
            </div>
            <button type="button" onclick="showSubprojectPickerModal(this)" class="px-4 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 transition text-sm">
              <i class="fas fa-folder-tree mr-1"></i>選択
            </button>
          </div>
        </div>
      </div>
      <div class="flex justify-end space-x-3 mt-6">
        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:border-gray-400">キャンセル</button>
        <button onclick="submitMemberProject(this)" class="px-4 py-2 rounded-lg bg-orange text-white hover:bg-orange-dark transition">
          ${mode === 'create' ? '追加' : '保存'}
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  loadInitialSubprojectInfo(modal, subprojectId);
}

async function loadInitialSubprojectInfo(modal, subprojectId) {
  const display = modal.querySelector('[data-role="subproject-text"]');
  if (!display) return;

  if (!subprojectId) {
    display.textContent = 'なし（未設定）';
    display.classList.remove('text-gray-900');
    display.classList.add('text-gray-500');
    return;
  }

  display.textContent = '読み込み中...';

  try {
    const response = await axios.get('/api/all-subprojects');
    const subprojects = response.data || [];
    const found = subprojects.find(s => s.id === subprojectId);

    if (found) {
      modal.dataset.selectedSubprojectId = found.id;
      modal.dataset.selectedSubprojectName = found.name;
      modal.dataset.selectedProjectName = found.project_name || '';
      display.textContent = `${found.project_name || '不明'} / ${found.name}`;
      display.classList.remove('text-gray-500');
      display.classList.add('text-gray-900');
    } else {
      display.textContent = 'なし（未設定）';
      display.classList.remove('text-gray-900');
      display.classList.add('text-gray-500');
    }
  } catch (error) {
    console.error('子プロジェクト情報取得エラー:', error);
    display.textContent = 'エラー: 取得失敗';
    display.classList.add('text-red-500');
  }
}

async function showSubprojectPickerModal(buttonEl) {
  const parentModal = buttonEl.closest('.fixed');
  if (!parentModal) return;

  const pickerModal = document.createElement('div');
  pickerModal.className = 'fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center';
  pickerModal.style.zIndex = '60';

  pickerModal.innerHTML = `
    <div class="bg-white rounded-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
      <div class="flex items-center justify-between mb-4 border-b pb-3">
        <h3 class="text-lg font-bold">プロジェクトを選択</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto" data-role="picker-content">
        <div class="text-center py-8 text-gray-500">読み込み中...</div>
      </div>
      <div class="border-t pt-3 mt-3">
        <button onclick="clearSubprojectSelection(this)" class="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition">
          選択をクリア（未設定にする）
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(pickerModal);
  loadProjectsList(pickerModal, parentModal);
}

async function loadProjectsList(pickerModal, parentModal) {
  const content = pickerModal.querySelector('[data-role="picker-content"]');
  if (!content) return;

  content.innerHTML = '<div class="text-center py-8 text-gray-500">読み込み中...</div>';

  try {
    const response = await axios.get('/api/projects');
    const projects = response.data || [];

    if (projects.length === 0) {
      content.innerHTML = '<div class="text-center py-8 text-gray-500">プロジェクトがありません</div>';
      return;
    }

    const html = projects.map(project => `
      <div class="border border-gray-200 rounded-lg p-3 mb-2 hover:bg-gray-50 cursor-pointer transition" onclick="showSubprojectsOfProject('${escapeJsString(project.id)}', '${escapeJsString(project.name)}', this)">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <i class="fas fa-folder text-orange mr-2"></i>
            <span class="font-semibold">${escapeHtml(project.name)}</span>
          </div>
          <i class="fas fa-chevron-right text-gray-400"></i>
        </div>
        ${project.description ? `<p class="text-xs text-gray-500 mt-1 ml-6">${escapeHtml(project.description)}</p>` : ''}
      </div>
    `).join('');

    content.innerHTML = html;
  } catch (error) {
    console.error('プロジェクト一覧取得エラー:', error);
    content.innerHTML = '<div class="text-center py-8 text-red-500">エラー: 取得失敗</div>';
  }
}

async function showSubprojectsOfProject(projectId, projectName, element) {
  const pickerModal = element.closest('.fixed');
  const content = pickerModal.querySelector('[data-role="picker-content"]');
  if (!content) return;

  content.innerHTML = '<div class="text-center py-8 text-gray-500">読み込み中...</div>';

  try {
    const response = await axios.get(`/api/projects/${projectId}/subprojects`);
    const subprojects = response.data || [];

    let html = `
      <div class="mb-4">
        <button onclick="loadProjectsList(this.closest('.fixed'), document.querySelectorAll('.fixed')[document.querySelectorAll('.fixed').length - 2])" class="flex items-center text-sm text-gray-600 hover:text-orange transition">
          <i class="fas fa-arrow-left mr-2"></i>プロジェクト一覧に戻る
        </button>
      </div>
      <div class="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <div class="flex items-center">
          <i class="fas fa-folder text-orange mr-2"></i>
          <span class="font-bold">${escapeHtml(projectName)}</span>
        </div>
      </div>
    `;

    if (subprojects.length === 0) {
      html += '<div class="text-center py-8 text-gray-500">子プロジェクトがありません</div>';
    } else {
      html += subprojects.map(sub => `
        <div class="border border-gray-200 rounded-lg p-3 mb-2 hover:bg-green-50 cursor-pointer transition" onclick="selectSubproject('${escapeJsString(sub.id)}', '${escapeJsString(sub.name)}', '${escapeJsString(projectName)}', this)">
          <div class="flex items-center">
            <i class="fas fa-folder-open text-green-600 mr-2"></i>
            <span class="font-medium">${escapeHtml(sub.name)}</span>
          </div>
          ${sub.description ? `<p class="text-xs text-gray-500 mt-1 ml-6">${escapeHtml(sub.description)}</p>` : ''}
        </div>
      `).join('');
    }

    content.innerHTML = html;
  } catch (error) {
    console.error('子プロジェクト一覧取得エラー:', error);
    content.innerHTML = '<div class="text-center py-8 text-red-500">エラー: 取得失敗</div>';
  }
}

function selectSubproject(subprojectId, subprojectName, projectName, element) {
  const pickerModal = element.closest('.fixed[style*="z-index: 60"]');
  const parentModal = document.querySelectorAll('.fixed')[0];

  if (parentModal) {
    parentModal.dataset.selectedSubprojectId = subprojectId;
    parentModal.dataset.selectedSubprojectName = subprojectName;
    parentModal.dataset.selectedProjectName = projectName;

    const display = parentModal.querySelector('[data-role="subproject-text"]');
    if (display) {
      display.textContent = `${projectName} / ${subprojectName}`;
      display.classList.remove('text-gray-500');
      display.classList.add('text-gray-900');
    }
  }

  if (pickerModal) {
    pickerModal.remove();
  }

  showNotification('子プロジェクトを選択しました', 'success');
}

function clearSubprojectSelection(buttonEl) {
  const pickerModal = buttonEl.closest('.fixed[style*="z-index: 60"]');
  const parentModal = document.querySelectorAll('.fixed')[0];

  if (parentModal) {
    parentModal.dataset.selectedSubprojectId = '';
    parentModal.dataset.selectedSubprojectName = '';
    parentModal.dataset.selectedProjectName = '';

    const display = parentModal.querySelector('[data-role="subproject-text"]');
    if (display) {
      display.textContent = 'なし（未設定）';
      display.classList.remove('text-gray-900');
      display.classList.add('text-gray-500');
    }
  }

  if (pickerModal) {
    pickerModal.remove();
  }

  showNotification('選択をクリアしました', 'info');
}

async function submitMemberProject(buttonEl) {
  if (!ensureNotGuest('担当プロジェクトを保存')) return;

  const modalContainer = buttonEl.closest('.fixed');
  const modal = buttonEl.closest('[data-role="member-project-modal"]');
  if (!modal || !modalContainer) return;

  const mode = modal.dataset.mode;
  const projectId = modal.dataset.projectId;
  const userId = modal.dataset.userId || currentUser.id;
  const title = modal.querySelector('input[name="member-project-title"]')?.value.trim();
  const status = modal.querySelector('select[name="member-project-status"]')?.value;
  const dueDateInput = modal.querySelector('input[name="member-project-due-date"]')?.value?.trim() || null;
  const dueDate = dueDateInput && /^\d{4}-\d{2}-\d{2}$/.test(dueDateInput) ? dueDateInput : null;
  const subprojectId = modalContainer.dataset.selectedSubprojectId || null;

  if (!title) {
    showNotification('タイトルを入力してください', 'error');
    return;
  }

  try {
    if (mode === 'create') {
      await axios.post('/api/member-projects', {
        userId,
        requesterId: currentUser.id,
        title,
        status,
        subprojectId,
        dueDate
      });
      showNotification('担当プロジェクトを追加しました', 'success');
    } else {
      await axios.put(`/api/member-projects/${projectId}`, {
        requesterId: currentUser.id,
        title,
        status,
        subprojectId,
        dueDate
      });
      showNotification('担当プロジェクトを更新しました', 'success');
    }

    modal.closest('.fixed')?.remove();
    await loadMemberProjects();
  } catch (error) {
    console.error('担当プロジェクト保存エラー:', error);
    const message = error.response?.data?.error || '保存に失敗しました';
    showNotification(message, 'error');
  }
}

async function deleteMemberProject(projectId) {
  if (!ensureNotGuest('担当プロジェクトを削除')) return;

  if (!confirm('この担当プロジェクトを削除しますか？')) return;

  try {
    await axios.delete(`/api/member-projects/${projectId}`, {
      data: { requesterId: currentUser.id }
    });
    showNotification('削除しました', 'success');
    await loadMemberProjects();
  } catch (error) {
    console.error('担当プロジェクト削除エラー:', error);
    const message = error.response?.data?.error || '削除に失敗しました';
    showNotification(message, 'error');
  }
}

/** 担当プロジェクトを達成として記録し、未達成一覧から外す */
async function achieveMemberProject(projectId) {
  if (!ensureNotGuest('担当プロジェクトを達成')) return;
  if (!confirm('この担当プロジェクトを達成として記録しますか？')) return;
  try {
    await axios.post(`/api/member-projects/${projectId}/achieve`, {
      requesterId: currentUser.id
    });
    showNotification('達成として記録しました', 'success');
    await loadMemberProjects();
  } catch (error) {
    console.error('担当プロジェクト達成エラー:', error);
    const message = error.response?.data?.error || '達成の記録に失敗しました';
    showNotification(message, 'error');
  }
}

function showAchievedAssignedProjectsPage() {
  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader()}
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">達成済みプロジェクト一覧</h2>
          <p class="text-sm text-gray-600 mt-1">ユーザーごとの達成済み担当プロジェクトです</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button onclick="showProjectsPage()" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:border-orange hover:text-orange transition">
            <i class="fas fa-arrow-left mr-2"></i>プロジェクト一覧
          </button>
          <button onclick="showAssignedProjectsPage()" class="bg-white border border-orange text-orange px-4 py-2 rounded-lg hover:bg-orange hover:text-white transition">
            <i class="fas fa-list mr-2"></i>担当プロジェクト一覧
          </button>
        </div>
      </div>
      <div id="achieved-member-projects-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="col-span-full text-center py-10 text-gray-500 bg-white border border-gray-200 rounded-lg">読み込み中...</div>
      </div>
    </div>
  `;

  loadAchievedMemberProjects();
}

async function loadAchievedMemberProjects() {
  const container = document.getElementById('achieved-member-projects-container');
  if (!container) return;

  container.innerHTML = '<div class="col-span-full text-center py-10 text-gray-500 bg-white border border-gray-200 rounded-lg">読み込み中...</div>';

  try {
    const response = await axios.get(`/api/member-projects?requesterId=${currentUser.id}&achieved=1`);
    const users = response.data || [];

    if (users.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12 text-gray-500 bg-white border border-gray-200 rounded-lg">
          <i class="fas fa-users-slash text-5xl mb-4 opacity-40"></i>
          <p class="font-semibold">メンバーが見つかりません</p>
        </div>
      `;
      return;
    }

    const cards = users.map((user) => {
      const achieved = (user.projects || []).filter(p => p.achieved_at);
      const canManage = currentUser.username === 'admin' || user.id === currentUser.id;

      const blocks = achieved.length > 0
        ? achieved.map(p => renderAchievedMemberProjectBlock(p, canManage)).join('')
        : '<div class="text-xs text-gray-400 px-2 py-2 italic">達成済みはありません</div>';

      return `
        <div class="bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition duration-200 flex flex-col h-full">
          <div class="flex items-center justify-between mb-2 border-b border-gray-100 pb-2">
            <div class="min-w-0 flex-1 mr-2">
              <div class="flex items-center">
                <div class="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center mr-2 flex-shrink-0">
                  <i class="fas fa-user text-xs text-gray-400"></i>
                </div>
                <h3 class="text-sm font-bold text-gray-900 truncate" title="${escapeHtml(user.username)}">${escapeHtml(user.username)}</h3>
              </div>
            </div>
            <span class="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">${achieved.length}</span>
          </div>
          <div class="overflow-x-auto custom-scrollbar pb-1 flex-1">
            <div class="flex space-x-2 min-w-max">${blocks}</div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = cards;
  } catch (error) {
    console.error('達成済み担当プロジェクト取得エラー:', error);
    container.innerHTML = `
      <div class="text-center py-12 text-red-500 bg-white border border-red-200 rounded-lg">
        達成済みプロジェクトの取得に失敗しました
      </div>
    `;
  }
}

/** 達成済み一覧用のカード（達成日を表示、削除のみ） */
function renderAchievedMemberProjectBlock(project, canManage) {
  let subLabel = '';
  if (project.subproject_name && project.subproject_id && project.parent_project_id) {
    subLabel = `<p class="text-[10px] text-blue-600 hover:text-blue-800 mt-1 truncate cursor-pointer underline" title="クリックして ${escapeHtml(project.project_name || '')} / ${escapeHtml(project.subproject_name)} を開く" onclick="event.stopPropagation(); showSubprojectPage('${escapeJsString(project.parent_project_id)}', '${escapeJsString(project.subproject_id)}')"><i class="fas fa-folder-open mr-1"></i>${escapeHtml(project.project_name || '')} / ${escapeHtml(project.subproject_name)}</p>`;
  } else if (project.subproject_name) {
    subLabel = `<p class="text-[10px] text-gray-600 mt-1 truncate" title="${escapeHtml(project.project_name || '')} / ${escapeHtml(project.subproject_name)}"><i class="fas fa-folder-open mr-1"></i>${escapeHtml(project.project_name || '')} / ${escapeHtml(project.subproject_name)}</p>`;
  }

  const dueDateStr = project.due_date ? project.due_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3') : '未定';
  const dueLabel = `<p class="text-[10px] mt-0.5 opacity-90"><i class="fas fa-calendar-alt mr-1"></i>納期: ${escapeHtml(dueDateStr)}</p>`;
  const achievedLabel = project.achieved_at
    ? `<p class="text-[10px] mt-0.5 font-semibold text-amber-800"><i class="fas fa-trophy mr-1"></i>達成: ${escapeHtml(formatMemberProjectAchievedAt(project.achieved_at))}</p>`
    : '';

  return `
    <div class="min-w-[140px] max-w-[140px] rounded p-2 shadow-sm border hover:shadow transition bg-slate-50 border-slate-300 text-slate-900">
      <div class="flex flex-col h-full justify-between gap-1">
        <div>
          <p class="font-bold text-xs truncate leading-tight" title="${escapeHtml(project.title)}">${escapeHtml(project.title)}</p>
          ${subLabel}
          ${dueLabel}
          ${achievedLabel}
        </div>
        ${canManage ? `
        <div class="flex items-center justify-end space-x-1 pt-1 border-t border-black/5 mt-1">
          <button onclick="deleteAchievedMemberProject('${escapeJsString(project.id)}')" class="p-0.5 rounded hover:bg-black/10 transition text-red-500" title="削除">
            <i class="fas fa-times text-[10px]"></i>
          </button>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

/** SQLite / API の achieved_at 文字列を画面表示用に整形 */
function formatMemberProjectAchievedAt(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) return `${d[1]}/${d[2]}/${d[3]}`;
  return s;
}

async function deleteAchievedMemberProject(projectId) {
  if (!ensureNotGuest('担当プロジェクトを削除')) return;
  if (!confirm('この担当プロジェクトを削除しますか？')) return;
  try {
    await axios.delete(`/api/member-projects/${projectId}`, {
      data: { requesterId: currentUser.id }
    });
    showNotification('削除しました', 'success');
    await loadAchievedMemberProjects();
  } catch (error) {
    console.error('担当プロジェクト削除エラー:', error);
    const message = error.response?.data?.error || '削除に失敗しました';
    showNotification(message, 'error');
  }
}

function showCreateProjectModal() {
  if (!ensureNotGuest('プロジェクトを作成')) return;

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
  if (!ensureNotGuest('プロジェクトを作成')) return;

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
  if (!ensureNotGuest('メンバーを管理')) return;

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
          <button onclick="createUser('${escapeHtml(user.username)}', '${escapeJsString(user.id)}')" class="text-orange hover:text-orange-dark">
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
        <button onclick="deleteUser('${escapeJsString(user.id)}', '${escapeHtml(user.username)}')" class="text-red-500 hover:text-red-600">
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

// ==================== 管理者：共有リンク管理 ====================

async function showAdminSharesPage() {
  const app = document.getElementById('app');

  app.innerHTML = `
    ${renderHeader()}
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold text-gray-900">共有リンク管理</h1>
        <button onclick="showProjectsPage()" class="text-gray-600 hover:text-gray-900">
          <i class="fas fa-arrow-left mr-2"></i>戻る
        </button>
      </div>
      
      <div id="shares-list" class="bg-white rounded-lg shadow">
        <div class="text-center py-8">
          <i class="fas fa-spinner fa-spin text-4xl text-gray-400"></i>
        </div>
      </div>
    </div>
  `;

  await loadAdminShares();
}

async function loadAdminShares() {
  try {
    const response = await axios.get('/api/admin/shares', {
      params: { userId: currentUser.id }
    });

    const shares = response.data;
    const list = document.getElementById('shares-list');

    if (shares.length === 0) {
      list.innerHTML = `
        <div class="text-center py-12 text-gray-500">
          <i class="fas fa-share-alt text-6xl mb-4 opacity-50"></i>
          <p>共有リンクがありません</p>
        </div>
      `;
      return;
    }

    // 制限越えリンクと通常リンクを分離
    const exceededShares = [];
    const activeShares = [];

    shares.forEach(share => {
      const max = share.max_downloads;
      const current = share.download_count || 0;
      // maxがnullなら無制限
      if (max !== null && current >= max) {
        exceededShares.push(share);
      } else {
        activeShares.push(share);
      }
    });

    let html = '';

    // 通常リンクの表示
    if (activeShares.length > 0) {
      html += `
        <div class="p-4 bg-white border-b border-gray-100 sticky top-0 z-10">
          <h3 class="text-lg font-bold text-gray-700">有効なリンク</h3>
        </div>
        ${renderSharesTable(activeShares, false)}
      `;
    }

    // 制限越えリンクの表示
    if (exceededShares.length > 0) {
      if (activeShares.length > 0) {
        html += '<div class="h-8 bg-gray-50 border-b border-gray-200"></div>';
      }
      html += `
        <div class="p-4 bg-red-50 border-b border-red-100 sticky top-0 z-10">
          <h3 class="text-lg font-bold text-red-700 flex items-center">
            <i class="fas fa-exclamation-circle mr-2"></i>制限越えリンク
          </h3>
        </div>
        ${renderSharesTable(exceededShares, true)}
      `;
    } else if (activeShares.length === 0) {
      // どちらもない場合
      html += `
        <div class="p-8 text-center text-gray-500">
          有効なリンクはありません
        </div>
      `;
    }

    // 全体をスクロール可能にするために高さを制限してオーバーフローを設定
    list.innerHTML = `<div class="max-h-[80vh] overflow-y-auto">${html}</div>`;

  } catch (error) {
    console.error('共有リンク取得エラー:', error);
    const list = document.getElementById('shares-list');
    list.innerHTML = `
      <div class="text-center py-12 text-red-500">
        <i class="fas fa-exclamation-triangle text-6xl mb-4"></i>
        <p>共有リンクの取得に失敗しました</p>
      </div>
    `;
  }
}

function renderSharesTable(shares, isExceeded) {
  return `
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ファイル名</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">作成者</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">作成日</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">残り日数</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ダウンロード数 (上限)</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${shares.map(share => {
    const max = share.max_downloads;
    const current = share.download_count || 0;
    const maxDisplay = max === null ? '無制限' : `${max}回`;
    const countDisplay = `${current} / ${maxDisplay}`;
    const remainingDisplay = (() => {
      if (!share.expires_at) return '無期限';
      const expiresAt = new Date(share.expires_at);
      const now = new Date();
      const diffMs = expiresAt.getTime() - now.getTime();
      const remainingDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (!Number.isFinite(remainingDays) || remainingDays <= 0) return '期限切れ';
      return `${remainingDays}日`;
    })();

    return `
            <tr class="hover:bg-gray-50 ${isExceeded ? 'bg-red-50' : ''}">
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center">
                  <i class="fas fa-file text-gray-400 mr-2"></i>
                  <span class="text-sm font-medium text-gray-900">${escapeHtml(share.file_name)}</span>
                </div>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-sm text-gray-600">${escapeHtml(share.creator_name)}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-sm text-gray-600">${formatDate(share.created_at)}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="text-sm ${remainingDisplay === '期限切れ' ? 'text-red-600 font-medium' : 'text-gray-600'}">
                  ${remainingDisplay}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isExceeded ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}">
                  ${countDisplay}
                </span>
                <button onclick="editShareLimit('${escapeJsString(share.id)}', ${max === null ? "'unlimited'" : max})" 
                  class="ml-2 text-gray-400 hover:text-orange text-xs" title="上限を変更">
                  <i class="fas fa-edit"></i>
                </button>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="copyShareLink('${escapeJsString(share.token)}')" 
                  class="text-blue-600 hover:text-blue-900 mr-3" title="リンクをコピー">
                  <i class="fas fa-copy"></i>
                </button>
                <button onclick="viewShareLink('${escapeJsString(share.token)}')" 
                  class="text-green-600 hover:text-green-900 mr-3" title="リンクを開く">
                  <i class="fas fa-external-link-alt"></i>
                </button>
                <button onclick="deleteShare('${escapeJsString(share.id)}')" 
                  class="text-red-600 hover:text-red-900" title="削除">
                  <i class="fas fa-trash"></i>
                </button>
              </td>
            </tr>
          `}).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function editShareLimit(shareId, currentMax) {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
      <h3 class="text-xl font-bold text-gray-900 mb-4">ダウンロード上限の変更</h3>
      
      <div class="mb-4">
        <label class="flex items-center space-x-2 cursor-pointer mb-2">
          <input type="checkbox" id="edit-unlimited" class="w-4 h-4 text-blue-600 rounded" 
            ${currentMax === 'unlimited' ? 'checked' : ''} onchange="toggleLimitInput(this)">
          <span class="text-gray-700">無制限にする</span>
        </label>
        
        <div id="limit-input-container" class="${currentMax === 'unlimited' ? 'hidden' : ''}">
          <label class="block text-sm font-medium text-gray-700 mb-1">上限回数</label>
          <input type="number" id="edit-limit-value" value="${currentMax === 'unlimited' ? 30 : currentMax}" 
            min="1" class="w-full border border-gray-300 rounded px-3 py-2">
        </div>
      </div>
      
      <div class="flex justify-end space-x-2">
        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50">キャンセル</button>
        <button onclick="saveShareLimit('${escapeJsString(shareId)}')" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

window.toggleLimitInput = function (checkbox) {
  const container = document.getElementById('limit-input-container');
  if (checkbox.checked) {
    container.classList.add('hidden');
  } else {
    container.classList.remove('hidden');
  }
};

async function saveShareLimit(shareId) {
  const isUnlimited = document.getElementById('edit-unlimited').checked;
  const limitValue = document.getElementById('edit-limit-value').value;

  const maxDownloads = isUnlimited ? null : parseInt(limitValue);

  if (!isUnlimited && (isNaN(maxDownloads) || maxDownloads < 1)) {
    alert('有効な数値を入力してください');
    return;
  }

  // モーダルを閉じる
  document.querySelector('.fixed.inset-0').remove();

  try {
    await axios.put(`/api/admin/shares/${shareId}`, {
      userId: currentUser.id,
      maxDownloads
    });

    showNotification('上限を更新しました', 'success');
    loadAdminShares();
  } catch (error) {
    console.error('更新エラー:', error);
    showNotification('更新に失敗しました', 'error');
  }
}

function copyShareLink(token) {
  const shareUrl = `${window.location.origin}/share/${token}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(() => {
      showNotification('リンクをコピーしました', 'success');
    }).catch(() => {
      // フォールバック
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showNotification('リンクをコピーしました', 'success');
    });
  } else {
    // 古いブラウザ対応
    const textarea = document.createElement('textarea');
    textarea.value = shareUrl;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showNotification('リンクをコピーしました', 'success');
  }
}

function viewShareLink(token) {
  const shareUrl = `${window.location.origin}/share/${token}`;
  window.open(shareUrl, '_blank');
}

async function deleteShare(shareId) {
  if (!confirm('この共有リンクを削除しますか？')) return;

  try {
    await axios.delete(`/api/admin/shares/${shareId}`, {
      data: { userId: currentUser.id }
    });
    showNotification('共有リンクを削除しました', 'success');
    loadAdminShares();
  } catch (error) {
    console.error('削除エラー:', error);
    showNotification('削除に失敗しました', 'error');
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
            <div class="flex space-x-2">
              <select id="subproject-sort-field" onchange="updateSubprojectSort()" class="bg-white border border-gray-300 text-gray-700 py-1 px-3 rounded-lg text-sm focus:outline-none focus:border-orange">
                <option value="display_order">カスタム順</option>
                <option value="name">名前順</option>
                <option value="created_at">作成順</option>
              </select>
              <button id="subproject-sort-order" onclick="toggleSubprojectOrder()" class="bg-white border border-gray-300 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-50 transition text-sm">
                <i class="fas fa-sort-amount-down"></i>
              </button>
              ${isGuestMode() ? '' : `
              <button onclick="showCreateSubprojectModal()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark transition text-sm">
                <i class="fas fa-plus mr-2"></i>追加
              </button>
              `}
            </div>
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
          <div class="flex items-center gap-2">
            ${isGuestMode() ? '' : (() => {
              const enabled = !!project.file_mapping_enabled;
              const isAdmin = currentUser.username === 'admin';
              if (isAdmin && !enabled) {
                return `
                  <button onclick="setFileMappingEnabled('${escapeJsString(projectId)}', true)" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:border-orange hover:text-orange transition text-sm">
                    <i class="fas fa-map-marker-alt mr-2"></i>ファイルマッピングを有効にする
                  </button>
                  <button onclick="showProjectSettings('${escapeJsString(projectId)}')" class="text-gray-500 hover:text-orange">
                    <i class="fas fa-cog text-xl"></i>
                  </button>
                `;
              }
              if (enabled) {
                return `
                  <button onclick="showFileMappingPage('${escapeJsString(projectId)}')" class="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:border-orange hover:text-orange transition text-sm">
                    <i class="fas fa-map-marker-alt mr-2"></i>ファイルマッピング
                  </button>
                  ${isAdmin ? `<button onclick="setFileMappingEnabled('${escapeJsString(projectId)}', false)" class="text-gray-500 hover:text-red-600 text-sm" title="ファイルマッピングを無効にする"><i class="fas fa-map-marker-alt-slash"></i></button>` : ''}
                  <button onclick="showProjectSettings('${escapeJsString(projectId)}')" class="text-gray-500 hover:text-orange">
                    <i class="fas fa-cog text-xl"></i>
                  </button>
                `;
              }
              return `
                <button onclick="showProjectSettings('${escapeJsString(projectId)}')" class="text-gray-500 hover:text-orange">
                  <i class="fas fa-cog text-xl"></i>
                </button>
              `;
            })()}
          </div>
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
      html += `<span class="cursor-pointer hover:text-orange" onclick="showProjectPage('${escapeJsString(currentProject)}')">${escapeHtml(currentProjectName)}</span>`;
      html += ' / ';
      html += `<span class="font-semibold">${escapeHtml(currentSubprojectName)}</span>`;
    } else {
      html += `<span class="font-semibold">${escapeHtml(currentProjectName)}</span>`;
    }
  }

  breadcrumb.innerHTML = html;
}

function showProjectSettings(projectId) {
  if (!ensureNotGuest('プロジェクト設定を編集')) return;

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
              <button onclick="deleteProject('${escapeJsString(projectId)}')" class="w-full bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 transition">
                <i class="fas fa-trash mr-2"></i>プロジェクトを削除
              </button>
            </div>
            ` : ''}
            
            <div class="flex space-x-3">
              <button onclick="updateProject('${escapeJsString(projectId)}')" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition">
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
  if (!ensureNotGuest('プロジェクトを更新')) return;

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
  if (!ensureNotGuest('プロジェクトを削除')) return;

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

// ==================== ファイルマッピング画面 ====================

let fileMappingProjectId = null;
let fileMappingProjectName = null;
let fileMappingFloor = 1;
let fileMappingSpots = [];
let fileMappingSelectedSpot = null;
let fileMappingSpotFiles = [];
let fileMappingFloorMaps = [];

async function setFileMappingEnabled(projectId, enabled) {
  if (!ensureNotGuest('ファイルマッピングの設定')) return;
  try {
    await axios.put(`/api/projects/${projectId}/file-mapping-enabled`, {
      userId: currentUser.id,
      enabled
    });
    showNotification(enabled ? 'ファイルマッピングを有効にしました' : 'ファイルマッピングを無効にしました', 'success');
    loadProjectHeader(projectId);
  } catch (err) {
    showNotification(err.response?.data?.error || '設定に失敗しました', 'error');
  }
}

async function showFileMappingPage(projectId) {
  fileMappingProjectId = projectId;
  fileMappingFloor = 1;
  fileMappingSpots = [];
  fileMappingSelectedSpot = null;
  fileMappingSpotFiles = [];
  fileMappingFloorMaps = [];

  const projectRes = await axios.get(`/api/projects/${projectId}`).catch(() => null);
  const project = projectRes?.data;
  if (!project) {
    showNotification('プロジェクトを取得できません', 'error');
    return;
  }
  fileMappingProjectName = project.name || 'プロジェクト';

  if (!project.file_mapping_enabled) {
    const app = document.getElementById('app');
    app.innerHTML = `
      ${renderHeader()}
      <div class="max-w-7xl mx-auto px-4 py-8">
        <button onclick="showProjectPage('${escapeJsString(projectId)}')" class="text-gray-600 hover:text-orange mb-4"><i class="fas fa-arrow-left mr-2"></i>戻る</button>
        <div class="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          <p class="mb-2">このプロジェクトではファイルマッピングは無効です。</p>
          <p class="text-sm">管理者が有効にすると利用できます。</p>
        </div>
      </div>
    `;
    return;
  }

  const floorMapsRes = await axios.get(`/api/projects/${projectId}/floor-maps`).catch(() => ({ data: [] }));
  fileMappingFloorMaps = floorMapsRes.data || [];
  const firstMap = fileMappingFloorMaps[0];
  if (firstMap) fileMappingFloor = firstMap.floor;

  const isAdmin = !isGuestMode() && currentUser.username === 'admin';
  const tabsHtml = fileMappingFloorMaps.length === 0
    ? '<span class="text-gray-500 text-sm">地図がありません</span>'
    : fileMappingFloorMaps.map(m => `
        <button type="button" data-floor="${m.floor}" data-map-id="${escapeHtml(m.id)}" class="map-floor-tab px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2">
          ${escapeHtml(m.name || 'F' + m.floor)}
          ${isAdmin ? `<button type="button" onclick="event.stopPropagation(); deleteFloorMap('${escapeJsString(m.id)}', '${escapeJsString(m.name || 'F' + m.floor)}')" class="text-red-500 hover:text-red-700 text-xs" title="地図を削除"><i class="fas fa-times"></i></button>` : ''}
        </button>
      `).join('');

  const mapAreaHtml = firstMap
    ? `<img id="map-image" src="${escapeHtml(firstMap.imageUrl || '/static/img/floormap_1f.svg')}" alt="地図" class="block max-w-full h-auto" onerror="this.src='/static/img/floormap_1f.svg'" />`
    : `<div id="map-image-placeholder" class="flex items-center justify-center bg-gray-200 text-gray-500 p-12 min-w-[300px] min-h-[200px]">地図を追加してください（管理者が地図をアップロードすると利用できます）</div>`;

  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader()}
    <div class="max-w-7xl mx-auto px-4 py-4">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div class="flex items-center gap-4">
          <button onclick="showProjectPage('${escapeJsString(projectId)}')" class="text-gray-600 hover:text-orange transition">
            <i class="fas fa-arrow-left mr-2"></i>戻る
          </button>
          <h2 class="text-xl font-bold text-gray-900">ファイルマッピング</h2>
          <span class="text-gray-500 text-sm">${escapeHtml(fileMappingProjectName)}</span>
        </div>
        ${isAdmin ? `<button type="button" onclick="openFloorMapUploadModal()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark text-sm"><i class="fas fa-plus mr-2"></i>地図を追加</button>` : ''}
      </div>

      <div class="flex flex-col lg:flex-row gap-4">
        <div class="flex-1 min-w-0">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            ${tabsHtml}
          </div>
          <div class="inline-block relative border border-gray-200 rounded-lg overflow-hidden bg-gray-100" id="map-container">
            ${mapAreaHtml}
            <div id="map-click-layer" class="absolute inset-0 cursor-crosshair" style="z-index: 1;"></div>
            <div id="map-markers-layer" class="absolute inset-0 pointer-events-none" style="z-index: 2;"></div>
          </div>
        </div>
        <div class="w-full lg:w-80 flex-shrink-0">
          <div id="map-spot-panel" class="bg-white border border-gray-200 rounded-lg p-4 min-h-[200px]">
            <p class="text-gray-500 text-sm">マーカーをクリックするとスポット情報が表示されます。</p>
          </div>
        </div>
      </div>
    </div>
  `;

  if (fileMappingFloorMaps.length > 0) {
    document.querySelectorAll('.map-floor-tab').forEach(btn => {
      if (btn.tagName !== 'BUTTON' || !btn.dataset.floor) return;
      btn.addEventListener('click', (e) => {
        if (e.target.closest('button[title="地図を削除"]')) return;
        const floor = parseInt(btn.dataset.floor, 10);
        const map = fileMappingFloorMaps.find(m => m.floor === floor);
        if (!map) return;
        fileMappingFloor = floor;
        document.querySelectorAll('.map-floor-tab').forEach(b => b.classList.remove('bg-orange', 'text-white', 'border-orange'));
        btn.classList.add('bg-orange', 'text-white', 'border-orange');
        const img = document.getElementById('map-image');
        if (img) {
          img.src = map.imageUrl || '/static/img/floormap_1f.svg';
          img.style.display = 'block';
        }
        loadFileMappingSpots();
      });
    });
    const firstTab = document.querySelector('.map-floor-tab[data-floor="' + firstMap.floor + '"]');
    if (firstTab) firstTab.classList.add('bg-orange', 'text-white', 'border-orange');
  }

  const clickLayer = document.getElementById('map-click-layer');
  if (clickLayer) {
    clickLayer.addEventListener('click', (e) => {
      if (fileMappingFloorMaps.length === 0 || !fileMappingFloorMaps.find(m => m.floor === fileMappingFloor)) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      openNewSpotModal(x, y);
    });
  }

  await loadFileMappingSpots();
}

function openFloorMapUploadModal() {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-sm w-full">
      <h3 class="text-lg font-bold mb-4">地図を追加</h3>
      <div class="space-y-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">階（数値）</label>
          <input type="number" id="floor-map-floor" min="1" value="1" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">表示名（例: F1）</label>
          <input type="text" id="floor-map-name" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" placeholder="F1" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">画像ファイル</label>
          <input type="file" id="floor-map-file" accept="image/*" class="w-full text-sm" />
        </div>
      </div>
      <div class="flex gap-2 mt-4">
        <button type="button" id="floor-map-upload-btn" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark">追加</button>
        <button type="button" class="flex-1 bg-gray-200 py-2 rounded-lg" onclick="this.closest('.fixed').remove()">キャンセル</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('floor-map-upload-btn').addEventListener('click', async () => {
    const floorInput = document.getElementById('floor-map-floor');
    const nameInput = document.getElementById('floor-map-name');
    const fileInput = document.getElementById('floor-map-file');
    const floor = parseInt(floorInput.value, 10);
    const name = (nameInput.value || 'F' + floor).trim();
    const file = fileInput.files && fileInput.files[0];
    if (!file || !file.type.startsWith('image/')) {
      showNotification('画像ファイルを選択してください', 'error');
      return;
    }
    if (Number.isNaN(floor) || floor < 1) {
      showNotification('階は1以上の数値を入力してください', 'error');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('floor', String(floor));
    form.append('name', name);
    form.append('userId', currentUser.id);
    try {
      await axios.post(`/api/projects/${fileMappingProjectId}/floor-maps`, form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      modal.remove();
      showNotification('地図を追加しました', 'success');
      showFileMappingPage(fileMappingProjectId);
    } catch (err) {
      showNotification(err.response?.data?.error || '追加に失敗しました', 'error');
    }
  });
}

async function deleteFloorMap(mapId, label) {
  if (!confirm('地図「' + label + '」を削除しますか？')) return;
  try {
    await axios.delete(`/api/projects/${fileMappingProjectId}/floor-maps/${mapId}`, {
      data: { userId: currentUser.id }
    });
    showNotification('地図を削除しました', 'success');
    showFileMappingPage(fileMappingProjectId);
  } catch (err) {
    showNotification(err.response?.data?.error || '削除に失敗しました', 'error');
  }
}

function openNewSpotModal(xPercent, yPercent) {
  if (isGuestMode()) {
    showNotification('ゲストはスポットを追加できません', 'error');
    return;
  }
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-sm w-full">
      <h3 class="text-lg font-bold mb-4">スポットを追加</h3>
      <label class="block text-sm font-medium text-gray-700 mb-2">名前</label>
      <input type="text" id="new-spot-name" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange" placeholder="スポット名" />
      <div class="flex gap-2 mt-4">
        <button type="button" id="new-spot-submit" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark">追加</button>
        <button type="button" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg" onclick="this.closest('.fixed').remove()">キャンセル</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const input = document.getElementById('new-spot-name');
  input.focus();
  document.getElementById('new-spot-submit').addEventListener('click', async () => {
    const name = input.value.trim();
    if (!name) {
      showNotification('名前を入力してください', 'error');
      return;
    }
    try {
      await axios.post(`/api/projects/${fileMappingProjectId}/map-spots`, {
        name,
        floor: fileMappingFloor,
        x_percent: xPercent,
        y_percent: yPercent,
        userId: currentUser.id
      });
      modal.remove();
      showNotification('スポットを追加しました', 'success');
      await loadFileMappingSpots();
    } catch (err) {
      showNotification(err.response?.data?.error || '追加に失敗しました', 'error');
    }
  });
}

async function loadFileMappingSpots() {
  if (!fileMappingProjectId) return;
  try {
    const res = await axios.get(`/api/projects/${fileMappingProjectId}/map-spots?floor=${fileMappingFloor}`);
    fileMappingSpots = res.data || [];
    renderMapMarkers();
    if (fileMappingSelectedSpot && !fileMappingSpots.find(s => s.id === fileMappingSelectedSpot.id)) {
      fileMappingSelectedSpot = null;
      fileMappingSpotFiles = [];
    }
    if (fileMappingSelectedSpot) {
      const spot = fileMappingSpots.find(s => s.id === fileMappingSelectedSpot.id);
      if (spot) fileMappingSelectedSpot = spot;
      await loadSpotFiles(fileMappingSelectedSpot.id);
    }
    renderSpotPanel();
  } catch (err) {
    console.error('スポット一覧取得エラー:', err);
    fileMappingSpots = [];
    renderMapMarkers();
    renderSpotPanel();
  }
}

function renderMapMarkers() {
  const layer = document.getElementById('map-markers-layer');
  if (!layer) return;
  layer.innerHTML = fileMappingSpots.map(spot => {
    const createdByName = spot.created_by_name || '-';
    const createdAt = spot.created_at ? formatDate(spot.created_at) : '-';
    return `
      <div
        class="map-marker absolute w-5 h-5 -ml-2.5 -mt-2.5 md:w-8 md:h-8 md:-ml-4 md:-mt-4 flex items-center justify-center rounded-full bg-orange text-white cursor-pointer hover:bg-orange-dark shadow pointer-events-auto"
        style="left: ${spot.x_percent}%; top: ${spot.y_percent}%;"
        data-spot-id="${escapeHtml(spot.id)}"
        title="${escapeHtml(spot.name)}"
      >
        <i class="fas fa-map-marker-alt text-xs"></i>
        <div class="map-spot-tooltip hidden absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-10">
          <div>${escapeHtml(spot.name)}</div>
          <div>作成: ${escapeHtml(createdAt)}</div>
          <div>作成者: ${escapeHtml(createdByName)}</div>
        </div>
      </div>
    `;
  }).join('');

  layer.querySelectorAll('[data-spot-id]').forEach(el => {
    const spotId = el.dataset.spotId;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectMapSpot(spotId);
    });
    el.addEventListener('mouseenter', () => {
      el.querySelector('.map-spot-tooltip')?.classList.remove('hidden');
    });
    el.addEventListener('mouseleave', () => {
      el.querySelector('.map-spot-tooltip')?.classList.add('hidden');
    });
  });
}

async function selectMapSpot(spotId) {
  const spot = fileMappingSpots.find(s => s.id === spotId);
  if (!spot) return;
  fileMappingSelectedSpot = spot;
  await loadSpotFiles(spotId);
  renderSpotPanel();
}

async function loadSpotFiles(spotId) {
  try {
    const res = await axios.get(`/api/projects/${fileMappingProjectId}/map-spots/${spotId}/files`);
    fileMappingSpotFiles = res.data || [];
  } catch (err) {
    fileMappingSpotFiles = [];
  }
}

function renderSpotPanel() {
  const panel = document.getElementById('map-spot-panel');
  if (!panel) return;
  if (!fileMappingSelectedSpot) {
    panel.innerHTML = '<p class="text-gray-500 text-sm">マーカーをクリックするとスポット情報が表示されます。</p>';
    return;
  }
  const spot = fileMappingSelectedSpot;
  const filesHtml = fileMappingSpotFiles.length === 0
    ? '<p class="text-gray-500 text-sm">割り当てられたファイルはありません。</p>'
    : '<ul class="space-y-2">' + fileMappingSpotFiles.map(f => `
        <li class="flex items-center justify-between gap-2 text-sm">
          <span class="truncate">${escapeHtml(f.subproject_name)} / ${escapeHtml(f.file_name)}</span>
          <button type="button" onclick="openFilePreviewFromMapping('${escapeJsString(f.file_id)}', '${escapeJsString((f.mime_type || '').replace(/'/g, "\\'"))}')" class="text-orange hover:underline flex-shrink-0" title="プレビュー">
            <i class="fas fa-eye"></i>
          </button>
        </li>
      `).join('') + '</ul>';

  panel.innerHTML = `
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <input type="text" id="spot-name-edit" class="flex-1 text-lg font-bold border border-transparent hover:border-gray-300 rounded px-2 py-1 -mx-2" value="${escapeHtml(spot.name)}" />
        <button type="button" onclick="fileMappingClearSelection()" class="text-gray-500 hover:text-gray-700 text-sm">選択解除</button>
      </div>
      <div>
        <h4 class="text-sm font-medium text-gray-700 mb-2">割り当てファイル</h4>
        ${filesHtml}
        ${isGuestMode() ? '' : `
        <button type="button" onclick="openFileAssignModal('${escapeJsString(spot.id)}')" class="mt-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg">
          <i class="fas fa-paperclip mr-1"></i>ファイルを割り当て
        </button>
        `}
      </div>
      ${isGuestMode() ? '' : `
      <div class="flex gap-2 pt-2 border-t">
        <button type="button" onclick="deleteMapSpot('${escapeJsString(spot.id)}')" class="text-red-600 hover:text-red-700 text-sm">
          <i class="fas fa-trash mr-1"></i>削除
        </button>
      </div>
      `}
    </div>
  `;

  const nameInput = document.getElementById('spot-name-edit');
  if (nameInput) {
    let blurTimer;
    nameInput.addEventListener('blur', () => {
      blurTimer = setTimeout(() => saveSpotName(spot.id, nameInput.value.trim()), 200);
    });
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        nameInput.blur();
      }
    });
  }
}

function fileMappingClearSelection() {
  fileMappingSelectedSpot = null;
  fileMappingSpotFiles = [];
  renderSpotPanel();
}

async function saveSpotName(spotId, name) {
  if (!name || name === fileMappingSelectedSpot?.name) return;
  try {
    await axios.put(`/api/projects/${fileMappingProjectId}/map-spots/${spotId}`, { name });
    const spot = fileMappingSpots.find(s => s.id === spotId);
    if (spot) spot.name = name;
    if (fileMappingSelectedSpot?.id === spotId) fileMappingSelectedSpot.name = name;
    renderMapMarkers();
    renderSpotPanel();
  } catch (err) {
    showNotification('名前の保存に失敗しました', 'error');
  }
}

async function deleteMapSpot(spotId) {
  if (!confirm('このスポットを削除しますか？')) return;
  try {
    await axios.delete(`/api/projects/${fileMappingProjectId}/map-spots/${spotId}`);
    showNotification('スポットを削除しました', 'success');
    fileMappingSelectedSpot = null;
    fileMappingSpotFiles = [];
    await loadFileMappingSpots();
  } catch (err) {
    showNotification(err.response?.data?.error || '削除に失敗しました', 'error');
  }
}

function openFileAssignModal(spotId) {
  axios.get(`/api/projects/${fileMappingProjectId}/files`)
    .then(async (res) => {
      const allFiles = res.data || [];
      const spotFilesRes = await axios.get(`/api/projects/${fileMappingProjectId}/map-spots/${spotId}/files`);
      const assignedIds = (spotFilesRes.data || []).map(f => f.file_id);

      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-lg w-full max-h-[80vh] flex flex-col">
          <h3 class="text-lg font-bold mb-4">ファイルを割り当て</h3>
          <p class="text-sm text-gray-600 mb-2">このプロジェクト配下のファイルを選択してください。</p>
          <div class="flex-1 overflow-y-auto border rounded p-2 space-y-1" id="file-assign-list"></div>
          <div class="flex gap-2 mt-4">
            <button type="button" id="file-assign-save" class="flex-1 bg-orange text-white py-2 rounded-lg">保存</button>
            <button type="button" class="flex-1 bg-gray-200 py-2 rounded-lg" onclick="this.closest('.fixed').remove()">キャンセル</button>
          </div>
        </div>
      `;
      const listEl = modal.querySelector('#file-assign-list');
      listEl.innerHTML = allFiles.length === 0
        ? '<p class="text-gray-500 text-sm">ファイルがありません。</p>'
        : allFiles.map(f => `
            <label class="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
              <input type="checkbox" class="file-assign-cb" data-file-id="${escapeHtml(f.id)}" ${assignedIds.includes(f.id) ? 'checked' : ''} />
              <span class="flex-1 truncate text-sm">${escapeHtml(f.subproject_name)} / ${escapeHtml(f.name)}</span>
              <button type="button" onclick="event.preventDefault(); openFilePreviewFromMapping('${escapeJsString(f.id)}', '${escapeJsString((f.mime_type || '').replace(/'/g, "\\'"))}')" class="text-orange text-sm" title="プレビュー"><i class="fas fa-eye"></i></button>
            </label>
          `).join('');

      document.body.appendChild(modal);
      document.getElementById('file-assign-save').addEventListener('click', async () => {
        const checked = modal.querySelectorAll('.file-assign-cb:checked');
        const fileIds = Array.from(checked).map(cb => cb.dataset.fileId);
        try {
          await axios.put(`/api/projects/${fileMappingProjectId}/map-spots/${spotId}/files`, { fileIds });
          modal.remove();
          showNotification('割り当てを保存しました', 'success');
          await loadSpotFiles(spotId);
          fileMappingSpotFiles = (await axios.get(`/api/projects/${fileMappingProjectId}/map-spots/${spotId}/files`)).data || [];
          renderSpotPanel();
        } catch (err) {
          showNotification(err.response?.data?.error || '保存に失敗しました', 'error');
        }
      });
    })
    .catch(() => showNotification('ファイル一覧の取得に失敗しました', 'error'));
}

function openFilePreviewFromMapping(fileId, mimeType) {
  axios.get(`/api/files/${fileId}/preview-url`)
    .then((res) => {
      if (!res.data?.success || !res.data.previewUrl) {
        showNotification('プレビューを取得できません', 'error');
        return;
      }
      const url = res.data.previewUrl;
      const mt = (mimeType || '').toLowerCase();
      if (mt.startsWith('image/')) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50';
        modal.innerHTML = `
          <div class="relative max-w-7xl max-h-full p-4">
            <button onclick="this.closest('.fixed').remove()" class="absolute top-4 right-4 text-white hover:text-gray-300 z-10 bg-black bg-opacity-50 rounded-full p-2">
              <i class="fas fa-times text-xl"></i>
            </button>
            <img src="${url}" alt="プレビュー" class="max-w-full max-h-[90vh] object-contain" onerror="this.closest('.fixed')?.remove();" />
          </div>
        `;
        document.body.appendChild(modal);
      } else {
        window.open(url, '_blank');
      }
    })
    .catch(() => showNotification('プレビューURLの取得に失敗しました', 'error'));
}

async function loadSubprojects(projectId) {
  try {
    const response = await axios.get(`/api/projects/${projectId}/subprojects?sortField=${currentSubprojectSort}&sortOrder=${currentSubprojectSortOrder}`);
    const subprojects = response.data;

    // ソートUIの状態を更新
    const sortFieldSelect = document.getElementById('subproject-sort-field');
    const sortOrderBtn = document.getElementById('subproject-sort-order');
    if (sortFieldSelect) sortFieldSelect.value = currentSubprojectSort;
    if (sortOrderBtn) {
      sortOrderBtn.innerHTML = currentSubprojectSortOrder === 'asc'
        ? '<i class="fas fa-sort-amount-down-alt"></i>'
        : '<i class="fas fa-sort-amount-down"></i>';
      sortOrderBtn.title = currentSubprojectSortOrder === 'asc' ? '昇順' : '降順';
    }

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

    // カスタム順の時のみドラッグ＆ドロップ可能
    const draggable = currentSubprojectSort === 'display_order';

    list.innerHTML = subprojects.map((sub, index) => `
      <div 
        class="bg-white border border-gray-200 rounded-lg p-4 hover:border-orange transition ${draggable ? 'cursor-move' : ''} subproject-item"
        ${draggable ? 'draggable="true"' : ''}
        data-subproject-id="${escapeHtml(sub.id)}"
        data-subproject-index="${index}"
        ${draggable ? `
          ondragstart="handleSubprojectDragStart(event)"
          ondragover="handleSubprojectDragOver(event)"
          ondrop="handleSubprojectDrop(event)"
          ondragend="handleSubprojectDragEnd(event)"
        ` : ''}
      >
        <div class="flex justify-between items-start">
          <div class="flex-1 cursor-pointer" onclick="handleSubprojectClick(event, '${escapeJsString(sub.id)}')">
            <h4 class="font-bold text-gray-900 mb-1">${sub.name}</h4>
            <p class="text-sm text-gray-600">${sub.description || '説明なし'}</p>
          </div>
          <div class="flex items-center space-x-2 ml-4">
            <button onclick="event.stopPropagation(); downloadSubprojectAsZip('${escapeJsString(sub.id)}', '${sub.name}')" class="text-gray-500 hover:text-orange" title="ZIPダウンロード">
              <i class="fas fa-download"></i>
            </button>
            ${currentUser.username === 'admin' ? `
            <button onclick="event.stopPropagation(); deleteSubproject('${escapeJsString(sub.id)}', '${sub.name}')" class="text-gray-500 hover:text-red-500" title="削除">
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

function updateSubprojectSort() {
  const select = document.getElementById('subproject-sort-field');
  currentSubprojectSort = select.value;
  loadSubprojects(currentProject);
}

function toggleSubprojectOrder() {
  currentSubprojectSortOrder = currentSubprojectSortOrder === 'asc' ? 'desc' : 'asc';
  loadSubprojects(currentProject);
}

// ==================== 子プロジェクトドラッグ&ドロップ ====================

let draggedSubprojectElement = null;

function handleSubprojectClick(event, subprojectId) {
  // ドラッグ中でなければクリックイベントを処理
  if (!draggedSubprojectElement) {
    showSubprojectPage(subprojectId);
  }
}

function handleSubprojectDragStart(event) {
  draggedSubprojectElement = event.currentTarget;
  event.currentTarget.style.opacity = '0.5';
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/html', event.currentTarget.innerHTML);
}

function handleSubprojectDragOver(event) {
  if (event.preventDefault) {
    event.preventDefault();
  }
  event.dataTransfer.dropEffect = 'move';

  const targetItem = event.currentTarget;
  if (draggedSubprojectElement !== targetItem) {
    targetItem.style.borderColor = '#f97316'; // オレンジ色のボーダー
  }

  return false;
}

function handleSubprojectDrop(event) {
  if (event.stopPropagation) {
    event.stopPropagation();
  }

  const targetItem = event.currentTarget;
  targetItem.style.borderColor = '';

  if (draggedSubprojectElement !== targetItem) {
    // 要素を入れ替え
    const allItems = Array.from(document.querySelectorAll('.subproject-item'));
    const draggedIndex = allItems.indexOf(draggedSubprojectElement);
    const targetIndex = allItems.indexOf(targetItem);

    const container = targetItem.parentNode;

    if (draggedIndex < targetIndex) {
      container.insertBefore(draggedSubprojectElement, targetItem.nextSibling);
    } else {
      container.insertBefore(draggedSubprojectElement, targetItem);
    }

    // 並び順を保存
    saveSubprojectOrder();
  }

  return false;
}

function handleSubprojectDragEnd(event) {
  event.currentTarget.style.opacity = '1';

  // すべてのアイテムのボーダーをリセット
  document.querySelectorAll('.subproject-item').forEach(item => {
    item.style.borderColor = '';
  });

  draggedSubprojectElement = null;
}

async function saveSubprojectOrder() {
  const items = document.querySelectorAll('.subproject-item');
  const orders = Array.from(items).map((item, index) => ({
    id: item.dataset.subprojectId,
    displayOrder: index
  }));

  try {
    await axios.put(`/api/projects/${currentProject}/subprojects/reorder`, { orders });
    showNotification('並び順を保存しました', 'success');
  } catch (error) {
    console.error('並び順保存エラー:', error);
    showNotification('並び順の保存に失敗しました', 'error');
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
            onclick="loadTimeline('${escapeJsString(projectId)}', ${page - 1})" 
            ${page === 1 ? 'disabled' : ''}
            class="px-3 py-1 text-sm ${page === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-orange hover:text-orange-dark'}">
            <i class="fas fa-chevron-left mr-1"></i>前へ
          </button>
          <span class="text-sm text-gray-600">
            ${page} / ${pagination.totalPages} ページ (全${pagination.total}件)
          </span>
          <button 
            onclick="loadTimeline('${escapeJsString(projectId)}', ${page + 1})" 
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
  if (!ensureNotGuest('子プロジェクトを追加')) return;

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
  if (!ensureNotGuest('子プロジェクトを追加')) return;

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
  if (!ensureNotGuest('子プロジェクトを削除')) return;

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

async function showSubprojectPage(projectIdOrSubprojectId, subprojectIdParam = null, initialPath = null) {
  // 引数が2つ渡された場合は新しい呼び出し方（projectId, subprojectId）
  // 引数が1つの場合は従来の呼び出し方（subprojectId のみ）
  // initialPath を渡すとそのディレクトリを開く（ファイル全体検索からの遷移用）
  let subprojectId;
  let projectId;

  if (subprojectIdParam !== null) {
    projectId = projectIdOrSubprojectId;
    subprojectId = subprojectIdParam;
    currentProject = projectId;
  } else {
    subprojectId = projectIdOrSubprojectId;
  }

  currentSubproject = subprojectId;
  currentPath = (initialPath !== null && initialPath !== undefined) ? initialPath : '/';

  const guest = isGuestMode();

  const app = document.getElementById('app');
  app.innerHTML = `
    ${renderHeader()}
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div id="project-breadcrumb" class="mb-4 text-sm text-gray-600">読み込み中...</div>
      
      <div class="mb-4 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div class="flex items-center space-x-2 bg-white border border-gray-200 rounded-lg p-2 w-full md:w-auto flex-1 max-w-2xl">
          <i class="fas fa-search text-gray-400 ml-2"></i>
          <input type="text" id="file-search-input" placeholder="ファイル名で検索..." class="flex-1 outline-none px-2 py-1" oninput="performSearch()">
          <button onclick="showAdvancedSearchModal()" class="text-gray-500 hover:text-orange px-3 py-1 text-sm whitespace-nowrap">
            <i class="fas fa-filter mr-1"></i>高度な検索
          </button>
          <button id="clear-search-btn" onclick="clearSearch()" class="hidden text-gray-500 hover:text-red-500 px-3 py-1">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <div class="flex items-center space-x-2">
          <select id="file-sort-field" onchange="updateFileSort()" class="bg-white border border-gray-300 text-gray-700 py-2 px-3 rounded-lg text-sm focus:outline-none focus:border-orange">
            <option value="default">標準</option>
            <option value="name">名前</option>
            <option value="file_size">サイズ</option>
            <option value="updated_at">更新日時</option>
            <option value="file_type">種類</option>
            <option value="updated_by">作成者</option>
          </select>
          <button id="file-sort-order" onclick="toggleFileOrder()" class="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 transition text-sm">
             <i class="fas fa-sort-amount-down"></i>
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
              ${guest ? '' : `
              <button onclick="deleteSelectedFiles()" class="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition">
                <i class="fas fa-trash mr-2"></i>選択を削除
              </button>
              `}
          </div>
            ${guest ? '' : `
            <button onclick="showApiKeyModal(currentSubproject)" class="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition">
              <i class="fas fa-key mr-2"></i>APIキー取得
            </button>
            <button onclick="showCreateFolderModal()" class="bg-white border border-orange text-orange px-4 py-2 rounded-lg hover:bg-orange hover:text-white transition">
              <i class="fas fa-folder-plus mr-2"></i>フォルダ作成
            </button>
            <button onclick="showUploadFileModal()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark transition">
              <i class="fas fa-upload mr-2"></i>ファイルアップロード
            </button>
            <button onclick="showCreateFileModal()" class="bg-orange text-white px-4 py-2 rounded-lg hover:bg-orange-dark transition">
              <i class="fas fa-plus mr-2"></i>ファイル作成
            </button>
            `}
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
    // projectId が設定されていない場合（従来の呼び出し方）、子プロジェクト情報から取得
    if (!projectId) {
      const subprojectResponse = await axios.get(`/api/subprojects/${subprojectId}`);
      if (subprojectResponse.data && subprojectResponse.data.project_id) {
        projectId = subprojectResponse.data.project_id;
        currentProject = projectId;
      }
    }

    // プロジェクト情報を取得
    if (projectId) {
      const projectResponse = await axios.get(`/api/projects/${projectId}`);
      if (projectResponse.data && projectResponse.data.name) {
        currentProjectName = projectResponse.data.name;
      }

      // 子プロジェクト名を取得
      const subprojectsResponse = await axios.get(`/api/projects/${projectId}/subprojects`);
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
    }
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
    const response = await axios.get(`/api/subprojects/${subprojectId}/files?path=${encodeURIComponent(path)}&sortField=${currentFileSort}&sortOrder=${currentFileSortOrder}`);
    const files = response.data;

    // ソートUIの状態を更新
    const sortFieldSelect = document.getElementById('file-sort-field');
    const sortOrderBtn = document.getElementById('file-sort-order');
    if (sortFieldSelect) sortFieldSelect.value = currentFileSort;
    if (sortOrderBtn) {
      sortOrderBtn.innerHTML = currentFileSortOrder === 'asc'
        ? '<i class="fas fa-sort-amount-down-alt"></i>'
        : '<i class="fas fa-sort-amount-down"></i>';
      sortOrderBtn.title = currentFileSortOrder === 'asc' ? '昇順' : '降順';
    }

    // パンくずリスト更新
    updateBreadcrumb(path);

    const list = document.getElementById('files-list');
    if (!list) return;

    let html = '';

    // 親ディレクトリへ戻るリンク
    if (path !== '/') {
      const parentPath = path.split('/').slice(0, -1).join('/') || '/';
      html += `
        <div class="flex items-center p-4 hover:bg-gray-50 cursor-pointer border-b border-gray-200" onclick="loadFiles('${escapeJsString(subprojectId)}', '${parentPath}')">
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
        <div class="flex items-center justify-between p-4 hover:bg-gray-50 ${index > 0 || path !== '/' ? 'border-t border-gray-200' : ''}" data-file-id="${file.id}" draggable="true" ondragstart="handleDragStart(event, '${escapeJsString(file.id)}', ${isFolder})" ondragend="handleDragEnd(event)" oncontextmenu="event.preventDefault(); showContextMenu(event, '${escapeJsString(file.id)}', '${escapedFileName}', ${isFolder})" ${isFolder ? `ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event, '${escapeJsString(file.id)}', '${escapedPath}')"` : ''}>
          <div class="flex items-center flex-1">
            <input type="checkbox" class="file-checkbox w-4 h-4 text-orange border-gray-300 rounded focus:ring-orange mr-3" data-file-id="${file.id}" data-file-name="${escapedFileName}" data-is-folder="${isFolder}" onchange="updateBulkActions()" onclick="event.stopPropagation();">
            <div class="flex items-center flex-1 ${isFolder ? 'cursor-pointer' : 'cursor-pointer'}" onclick="${isFolder ? `loadFiles('${escapeJsString(subprojectId)}', '${escapedPath}')` : `selectFile('${escapeJsString(file.id)}')`}">
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
              <button onclick="event.stopPropagation(); showShareModal('${escapeJsString(file.id)}', '${escapedFileName}')" class="text-gray-500 hover:text-blue-500 p-2" title="共有リンクを作成">
                <i class="fas fa-share-alt"></i>
              </button>
              <button onclick="event.stopPropagation(); downloadFile('${escapeJsString(file.id)}', '${escapedFileName}')" class="text-gray-500 hover:text-orange p-2">
                <i class="fas fa-download"></i>
              </button>
            ` : ''}
            <button onclick="event.stopPropagation(); deleteFile('${escapeJsString(file.id)}', '${escapedFileName}', ${isFolder})" class="text-gray-500 hover:text-red-500 p-2">
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

function updateFileSort() {
  const select = document.getElementById('file-sort-field');
  currentFileSort = select.value;
  loadFiles(currentSubproject, currentPath);
}

function toggleFileOrder() {
  currentFileSortOrder = currentFileSortOrder === 'asc' ? 'desc' : 'asc';
  loadFiles(currentSubproject, currentPath);
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
  if (!ensureNotGuest('ファイルを削除')) return;

  const checkboxes = document.querySelectorAll('.file-checkbox:checked');

  if (checkboxes.length === 0) {
    showNotification('ファイルを選択してください', 'error');
    return;
  }

  const files = Array.from(checkboxes).map(checkbox => ({
    id: checkbox.dataset.fileId,
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
  if (!breadcrumb) {
    return;
  }

  const parts = path.split('/').filter(p => p);
  const subprojectParam = escapeJsString(currentSubproject || '');

  let html = '<i class="fas fa-folder-open mr-2"></i>';
  html += `<span class="cursor-pointer text-orange hover:text-orange-dark font-semibold" onclick="loadFiles('${subprojectParam}', '/')">ルート</span>`;

  let accumulatedPath = '';
  parts.forEach((part, index) => {
    accumulatedPath += '/' + part;
    html += ' / ';
    if (index === parts.length - 1) {
      html += `<span class="font-semibold">${escapeHtml(part)}</span>`;
    } else {
      const escapedAccumulated = escapeJsString(accumulatedPath);
      html += `<span class="cursor-pointer hover:text-orange" onclick="loadFiles('${subprojectParam}', '${escapedAccumulated}')">${escapeHtml(part)}</span>`;
    }
  });

  breadcrumb.innerHTML = html;
}

// ==================== フォルダ作成 ====================

function showCreateFolderModal() {
  if (!ensureNotGuest('フォルダを作成')) return;

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
  if (!ensureNotGuest('フォルダを作成')) return;

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
  if (!ensureNotGuest('ファイルをアップロード')) return;

  selectedFiles = []; // 選択ファイルをリセット

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-6xl w-full mx-4">
      <h3 class="text-2xl font-bold mb-4">ファイルアップロード</h3>
      
      <div class="flex gap-6">
        <!-- 左側: アップロード領域 -->
        <div class="flex-1 space-y-4">
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
        
        <!-- 右側: 進捗表示 -->
        <div class="w-80 border-l border-gray-200 pl-6">
          <h4 class="text-lg font-semibold mb-3 text-gray-900">アップロード進捗</h4>
          <div id="upload-progress-container" class="space-y-2">
            <p class="text-sm text-gray-500 text-center py-8">ファイルを選択してアップロードを開始してください</p>
          </div>
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
      const retryMessage = `リトライ ${attempt + 1}/${maxRetries} (${delay / 1000}秒待機)...`;
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
  if (!ensureNotGuest('ファイルをアップロード')) return;

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

    // 進捗表示を右側のコンテナに移動
    const progressContainer = document.getElementById('upload-progress-container');
    progressContainer.innerHTML = `
      <div class="mb-4">
        <div id="upload-progress-text" class="text-sm font-medium text-gray-700 mb-2">アップロード中: 0/${totalFiles}</div>
        <div class="w-full bg-gray-200 rounded-full h-2.5 mb-4">
          <div id="upload-progress" class="bg-orange h-2.5 rounded-full transition-all duration-300" style="width: 0%"></div>
        </div>
      </div>
      <div id="upload-file-progress" class="space-y-2 max-h-96 overflow-y-auto pr-2"></div>
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

    // ファイルを個別にアップロード（並列処理、最大256個まで）
    const maxConcurrent = 128;

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
          } else if (error.message && error.message.includes('ファイルサイズが大きすぎます')) {
            // サイズ超過エラーは詳細に表示
            alert(error.message);
            console.error(`ファイル ${file.name} のアップロードエラー:`, error);
            failCount++;
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
  // ファイルサイズ制限チェック（10GB）
  const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
  if (file.size > MAX_FILE_SIZE) {
    const fileSizeGB = (file.size / 1024 / 1024 / 1024).toFixed(2);
    throw new Error(
      `ファイルサイズが大きすぎます（${fileSizeGB}GB）。\n` +
      `ブラウザからのアップロードは10GBまでです。\n` +
      `大容量ファイルはCLIツール（cgit.exe）を使用してください。`
    );
  }

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
  if (!ensureNotGuest('ファイルを作成')) return;

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
  if (!ensureNotGuest('ファイルを作成')) return;

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

// ==================== APIキー管理 ====================

async function showApiKeyModal(subprojectId) {
  if (!ensureNotGuest('APIキーを取得')) return;

  console.log('showApiKeyModal called with subprojectId:', subprojectId);
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-2xl w-full">
      <h3 class="text-2xl font-bold mb-4">APIキー取得</h3>
      
      <div class="space-y-4">
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <p class="text-sm text-yellow-800">
            <i class="fas fa-exclamation-triangle mr-2"></i>
            <strong>重要:</strong> APIキーはこの時だけ表示されます。安全な場所に保存してください。
          </p>
        </div>
        
        <div id="api-key-loading" class="text-center py-8">
          <i class="fas fa-spinner fa-spin text-2xl text-gray-400 mb-2"></i>
          <p class="text-gray-600">APIキーを生成中...</p>
        </div>
        
        <div id="api-key-content" class="hidden">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">APIキー (子プロジェクトID: ${subprojectId})</label>
            <div class="flex space-x-2">
              <textarea id="api-key-value" rows="3" readonly spellcheck="false" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm resize-none overflow-auto"></textarea>
              <button onclick="copyApiKey()" class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition">
                <i class="fas fa-copy mr-2"></i>コピー
              </button>
            </div>
          </div>
          
          <div class="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 class="font-semibold text-gray-900 mb-2">使い方:</h4>
            <ol class="list-decimal list-inside space-y-1 text-sm text-gray-700">
              <li>APIキーをコピーします</li>
              <li>コマンドラインで <code class="bg-gray-200 px-1 rounded">cgit.exe &lt;APIキー&gt; -n 任意ファイル名</code> を実行します（-nは省略可）</li>
            </ol>
          </div>
        </div>
        
        <div class="flex space-x-3 mt-6">
          <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
            閉じる
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  try {
    const response = await axios.post(`/api/subprojects/${subprojectId}/api-keys`, {
      userId: currentUser.id
    });

    const apiKey = response.data.apiKey;

    document.getElementById('api-key-loading').classList.add('hidden');
    document.getElementById('api-key-content').classList.remove('hidden');
    document.getElementById('api-key-value').value = apiKey;
  } catch (error) {
    console.error('APIキー生成エラー:', error);
    document.getElementById('api-key-loading').innerHTML = `
      <div class="text-red-600">
        <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
        <p>APIキーの生成に失敗しました</p>
        <p class="text-sm mt-2">${error.response?.data?.error || 'エラーが発生しました'}</p>
      </div>
    `;
  }
}

function copyApiKey() {
  const apiKeyInput = document.getElementById('api-key-value');
  apiKeyInput.focus();
  apiKeyInput.select();
  apiKeyInput.setSelectionRange(0, apiKeyInput.value.length); // モバイル対応
  document.execCommand('copy');
  showNotification('APIキーをクリップボードにコピーしました', 'success');
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
  const guest = isGuestMode();

  modal.innerHTML = `
    <div class="bg-white rounded-lg p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
      <h3 class="text-2xl font-bold mb-4">${escapedFileName}</h3>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">内容</label>
          <textarea id="edit-file-content" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-orange font-mono text-sm" rows="15" ${guest ? 'readonly' : ''}></textarea>
        </div>
        
        <div class="flex space-x-3">
          ${guest ? '' : `
          <button onclick="updateFile('${escapeJsString(fileId)}')" class="flex-1 bg-orange text-white py-2 rounded-lg hover:bg-orange-dark transition">
            保存
          </button>
          `}
          <button onclick="this.closest('.fixed').remove()" class="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-300 transition">
            閉じる
          </button>
        </div>
        ${guest ? `<p class="text-sm text-gray-500">ゲストモードでは編集できません（閲覧のみ）。</p>` : ''}
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
  if (!ensureNotGuest('ファイルを更新')) return;

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
  if (!ensureNotGuest(`${isFolder ? 'フォルダ' : 'ファイル'}を削除`)) return;

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

// ==================== ファイル共有機能 ====================

async function showShareModal(fileId, fileName) {
  if (!ensureNotGuest('ファイルを共有')) return;

  try {
    const response = await axios.post(`/api/files/${fileId}/share`, {
      userId: currentUser.id
    });

    const shareUrl = `${window.location.origin}/share/${response.data.token}`;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-bold text-gray-900">共有リンク</h3>
          <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
            <i class="fas fa-times"></i>
          </button>
        </div>
        
        <p class="text-sm text-gray-600 mb-4">${escapeHtml(fileName)} の共有リンクを作成しました</p>
        
        <div class="mb-4 bg-gray-50 p-3 rounded border border-gray-200">
          <p class="text-xs text-gray-500 mb-2">このリンクを共有すると、誰でもファイルをダウンロードできます</p>
          <input type="text" id="share-url" value="${shareUrl}" readonly 
            class="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm">
        </div>
        
        <div class="flex justify-end space-x-2">
          <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            閉じる
          </button>
          <button onclick="copyShareUrl()" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            <i class="fas fa-copy mr-2"></i>コピー
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  } catch (error) {
    console.error('共有リンク作成エラー:', error);
    showNotification('共有リンクの作成に失敗しました', 'error');
  }
}

function copyShareUrl() {
  const input = document.getElementById('share-url');
  if (input) {
    input.select();
    input.setSelectionRange(0, 99999); // モバイル対応

    // モダンブラウザ対応
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(() => {
        showNotification('リンクをコピーしました', 'success');
      }).catch(() => {
        // フォールバック
        document.execCommand('copy');
        showNotification('リンクをコピーしました', 'success');
      });
    } else {
      // 古いブラウザ対応
      document.execCommand('copy');
      showNotification('リンクをコピーしました', 'success');
    }
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
              <div class="flex items-center flex-1 ${isFolder ? 'cursor-pointer' : 'cursor-pointer'}" onclick="${isFolder ? `loadFiles('${escapeJsString(currentSubproject)}', '${escapedPath}')` : `loadAndShowFileEditor('${escapeJsString(file.id)}')`}">
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
                <button onclick="event.stopPropagation(); downloadFile('${escapeJsString(file.id)}', '${escapedFileName}')" class="text-gray-500 hover:text-orange p-2">
                  <i class="fas fa-download"></i>
                </button>
              ` : ''}
              <button onclick="event.stopPropagation(); deleteFile('${escapeJsString(file.id)}', '${escapedFileName}', ${isFolder})" class="text-gray-500 hover:text-red-500 p-2">
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
  if (isGuestMode()) return;

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

  if (isGuestMode()) return;

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

  const guest = isGuestMode();

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
      <button onclick="selectFile('${escapeJsString(fileId)}'); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
        <i class="fas fa-eye mr-2"></i>プレビュー
      </button>
      <button onclick="downloadFile('${escapeJsString(fileId)}', '${escapeHtml(fileName)}'); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
        <i class="fas fa-download mr-2"></i>ダウンロード
      </button>
    ` : ''}
    ${guest ? '' : `
    <button onclick="${isFolder ? `showRenameFolderModal('${escapeJsString(fileId)}', '${escapeHtml(fileName)}')` : `showRenameFileModal('${escapeJsString(fileId)}', '${escapeHtml(fileName)}')`}; document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
      <i class="fas fa-edit mr-2"></i>名前変更
    </button>
    <button onclick="showMoveFileModal('${escapeJsString(fileId)}', '${escapeHtml(fileName)}', ${isFolder}); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
      <i class="fas fa-arrows-alt mr-2"></i>移動
    </button>
    <button onclick="showCopyFileModal('${escapeJsString(fileId)}', '${escapeHtml(fileName)}', ${isFolder}); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
      <i class="fas fa-copy mr-2"></i>コピー
    </button>
    `}
    <hr class="my-1">
    <button onclick="showFileHistory('${escapeJsString(fileId)}'); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
      <i class="fas fa-history mr-2"></i>変更ログ
    </button>
    ${guest ? '' : `
    <hr class="my-1">
    <button onclick="deleteFile('${escapeJsString(fileId)}', '${escapeHtml(fileName)}', ${isFolder}); document.getElementById('context-menu')?.remove();" class="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 text-sm">
      <i class="fas fa-trash mr-2"></i>削除
    </button>
    `}
  `;

  // メニュー外をクリックで閉じる
  setTimeout(() => {
    const closeMenuHandler = function (e) {
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
  if (!ensureNotGuest('ファイルを移動')) return;

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
  if (!ensureNotGuest('ファイルを移動')) return;

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
  if (!ensureNotGuest('ファイルをコピー')) return;

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
  if (!ensureNotGuest('ファイルをコピー')) return;

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
  if (!ensureNotGuest('ファイル名を変更')) return;

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
  if (!ensureNotGuest('ファイル名を変更')) return;

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

// フォルダー名変更モーダル表示
function showRenameFolderModal(folderId, currentName) {
  if (!ensureNotGuest('フォルダ名を変更')) return;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-gray-900">フォルダー名変更</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">新しいフォルダー名</label>
        <input type="text" id="rename-folder-new-name" value="${escapeHtml(currentName)}" class="w-full border border-gray-300 rounded-lg px-3 py-2">
      </div>
      
      <div class="mb-4 bg-blue-50 border border-blue-200 rounded p-3">
        <p class="text-xs text-blue-700">
          <i class="fas fa-info-circle mr-1"></i>
          フォルダー内のすべてのファイルとサブフォルダーのパスも自動的に更新されます
        </p>
      </div>
      
      <div class="flex justify-end space-x-2">
        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
          キャンセル
        </button>
        <button onclick="executeRenameFolder('${escapeJsString(folderId)}')" class="px-4 py-2 bg-orange text-white rounded-lg hover:bg-orange-dark">
          変更
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 入力フィールドにフォーカスして選択
  setTimeout(() => {
    const input = document.getElementById('rename-folder-new-name');
    if (input) {
      input.focus();
      input.select();
    }
  }, 100);
}

// フォルダー名変更実行
async function executeRenameFolder(folderId) {
  if (!ensureNotGuest('フォルダ名を変更')) return;

  const newNameInput = document.getElementById('rename-folder-new-name');
  if (!newNameInput) return;

  const newName = newNameInput.value.trim();
  if (!newName) {
    showNotification('フォルダー名を入力してください', 'error');
    return;
  }

  // 無効な文字のチェック
  if (newName.includes('/') || newName.includes('\\')) {
    showNotification('フォルダー名に / や \\ は使用できません', 'error');
    return;
  }

  try {
    await axios.put(`/api/folders/${folderId}/rename`, {
      newName: newName,
      userId: currentUser.id,
      subprojectId: currentSubproject
    });

    showNotification('フォルダー名を変更しました', 'success');
    document.querySelector('.fixed.inset-0')?.remove();
    loadFiles(currentSubproject, currentPath);
  } catch (error) {
    console.error('フォルダー名変更エラー:', error);
    const errorMessage = error.response?.data?.error || 'フォルダー名の変更に失敗しました';
    showNotification(errorMessage, 'error');
  }
}

// ==================== ファイル共有機能 ====================

async function showShareModal(fileId, fileName) {
  if (!ensureNotGuest('ファイルを共有')) return;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-gray-900">共有リンクの作成</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <p class="text-sm text-gray-600 mb-4">${escapeHtml(fileName)} を共有します。</p>
      
      <div class="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
        <label for="share-limit" class="block text-gray-900 font-medium mb-2">
          ダウンロード回数の上限
        </label>
        <div class="flex items-center space-x-3">
          <input type="range" id="share-limit" min="1" max="33" step="1" value="5"
            class="w-full accent-blue-600">
          <span id="share-limit-value" class="text-sm font-semibold text-gray-900 w-16 text-right"></span>
        </div>
        <p class="text-xs text-gray-500 mt-2">範囲は1〜32回、無制限まで設定できます。デフォルトは5回。</p>
      </div>

      <div class="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <label class="block text-gray-900 font-medium mb-2">共有リンクの保持期間</label>
        <p class="text-sm text-gray-700">通常は1か月で期限切れになります。</p>
        ${currentUser.username === 'admin' ? `
          <label class="flex items-center space-x-2 cursor-pointer mt-3">
            <input type="checkbox" id="share-unlimited-expiry" class="w-4 h-4 text-blue-600 rounded">
            <span class="text-gray-700">無期限リンクにする（adminのみ）</span>
          </label>
        ` : ''}
      </div>
      
      <div class="flex justify-end space-x-2">
        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
          キャンセル
        </button>
        <button onclick="createShareLink('${escapeJsString(fileId)}', '${escapeJsString(fileName)}')" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          リンクを作成
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const shareLimitInput = document.getElementById('share-limit');
  const shareLimitValue = document.getElementById('share-limit-value');
  const updateShareLimitLabel = () => {
    if (!shareLimitInput || !shareLimitValue) return;
    const value = parseInt(shareLimitInput.value, 10);
    shareLimitValue.textContent = value >= 33 ? '無制限' : `${value}回`;
  };
  if (shareLimitInput) {
    shareLimitInput.addEventListener('input', updateShareLimitLabel);
  }
  updateShareLimitLabel();
}

async function createShareLink(fileId, fileName) {
  const shareLimitInput = document.getElementById('share-limit');
  const rawValue = shareLimitInput ? parseInt(shareLimitInput.value, 10) : 5;
  const maxDownloads = Number.isNaN(rawValue) ? 5 : (rawValue >= 33 ? null : rawValue);
  const isUnlimited = maxDownloads === null;
  const expiryCheckbox = document.getElementById('share-unlimited-expiry');
  const unlimitedExpiry = expiryCheckbox ? expiryCheckbox.checked : false;
  if (isUnlimited) {
    showNotification('無制限の共有リンクを作成します', 'info');
  }

  // モーダルを閉じる
  const modal = document.querySelector('.fixed.inset-0');
  if (modal) modal.remove();

  try {
    const response = await axios.post(`/api/files/${fileId}/share`, {
      userId: currentUser.id,
      isUnlimited,
      maxDownloads,
      unlimitedExpiry
    });

    showShareResultModal(fileName, response.data.token);
  } catch (error) {
    console.error('共有リンク作成エラー:', error);
    showNotification('共有リンクの作成に失敗しました', 'error');
  }
}

function showShareResultModal(fileName, token) {
  const shareUrl = `${window.location.origin}/share/${token}`;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
  modal.innerHTML = `
    <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-gray-900">共有リンク</h3>
        <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
          <i class="fas fa-times"></i>
        </button>
      </div>
      
      <p class="text-sm text-gray-600 mb-4">${escapeHtml(fileName)} の共有リンクを作成しました</p>
      
      <div class="mb-4 bg-gray-50 p-3 rounded border border-gray-200">
        <input type="text" id="share-url" value="${shareUrl}" readonly 
          class="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-sm">
      </div>
      
      <div class="flex justify-end space-x-2">
        <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
          閉じる
        </button>
        <button onclick="copyShareUrl()" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
          <i class="fas fa-copy mr-2"></i>コピー
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function copyShareUrl() {
  const input = document.getElementById('share-url');
  if (input) {
    input.select();
    input.setSelectionRange(0, 99999);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(() => {
        showNotification('リンクをコピーしました', 'success');
      }).catch(() => {
        document.execCommand('copy');
        showNotification('リンクをコピーしました', 'success');
      });
    } else {
      document.execCommand('copy');
      showNotification('リンクをコピーしました', 'success');
    }
  }
}

// ==================== プレビュー機能 ====================

let activePreviewKeydownHandler = null;

/** メディアプレビューモーダル用の矢印キーリスナーを解除する */
function cleanupPreviewKeydownNav() {
  if (activePreviewKeydownHandler) {
    document.removeEventListener('keydown', activePreviewKeydownHandler, true);
    activePreviewKeydownHandler = null;
  }
}

/**
 * 左・右矢印キーで前後のプレビューへ移動する（キャプチャフェーズで登録）
 * @param {HTMLElement} modal 閉じる対象のオーバーレイ要素
 * @param {string|null} prevId 前のファイルID
 * @param {string|null} nextId 次のファイルID
 * @param {(id: string) => void} onNavigate showImagePreview / showVideoPreview など
 */
function attachPreviewKeydownNav(modal, prevId, nextId, onNavigate) {
  cleanupPreviewKeydownNav();
  activePreviewKeydownHandler = (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      return;
    }
    if (e.key === 'ArrowLeft' && prevId) {
      e.preventDefault();
      cleanupPreviewKeydownNav();
      modal.remove();
      onNavigate(prevId);
    } else if (e.key === 'ArrowRight' && nextId) {
      e.preventDefault();
      cleanupPreviewKeydownNav();
      modal.remove();
      onNavigate(nextId);
    }
  };
  document.addEventListener('keydown', activePreviewKeydownHandler, true);
}

// 画像プレビュー
async function showImagePreview(fileId) {
  cleanupPreviewKeydownNav();
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

    const prevId = currentIndex > 0 ? files[currentIndex - 1].id : null;
    const nextId = currentIndex >= 0 && currentIndex < files.length - 1 ? files[currentIndex + 1].id : null;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50';
    modal.innerHTML = `
      <button type="button" data-image-preview-close class="fixed top-4 right-4 text-white hover:text-gray-300 z-20 bg-black bg-opacity-50 rounded-full p-2">
        <i class="fas fa-times text-xl"></i>
      </button>
      ${prevId ? `
        <button type="button" data-preview-nav="prev" class="fixed left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 z-20 bg-black bg-opacity-50 rounded-full p-3">
          <i class="fas fa-chevron-left"></i>
        </button>
      ` : ''}
      ${nextId ? `
        <button type="button" data-preview-nav="next" class="fixed right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 z-20 bg-black bg-opacity-50 rounded-full p-3">
          <i class="fas fa-chevron-right"></i>
        </button>
      ` : ''}
      <div class="relative max-w-7xl max-h-full p-4 flex flex-col items-center justify-center">
        <img src="${previewUrl}" alt="${escapeHtml(displayFileName)}" class="max-w-full max-h-[90vh] object-contain" data-preview-main-media>
        <div class="text-center text-white mt-4">
          <p class="font-semibold mb-1">${escapeHtml(displayFileName)}</p>
          <p class="text-sm opacity-75">${currentIndex >= 0 ? currentIndex + 1 : '?'} / ${files.length}</p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const handleClose = () => {
      cleanupPreviewKeydownNav();
      modal.remove();
    };
    modal.querySelector('[data-image-preview-close]')?.addEventListener('click', handleClose);

    const go = (targetId) => {
      if (!targetId) return;
      cleanupPreviewKeydownNav();
      modal.remove();
      showImagePreview(targetId);
    };
    modal.querySelector('[data-preview-nav="prev"]')?.addEventListener('click', () => go(prevId));
    modal.querySelector('[data-preview-nav="next"]')?.addEventListener('click', () => go(nextId));

    modal.querySelector('[data-preview-main-media]')?.addEventListener('error', () => {
      cleanupPreviewKeydownNav();
      alert('画像の読み込みに失敗しました');
      modal.remove();
    }, { once: true });

    attachPreviewKeydownNav(modal, prevId, nextId, showImagePreview);
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
  cleanupPreviewKeydownNav();
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

    let files = [];
    if (currentSearchQuery || Object.values(currentFilters).some(v => v !== null)) {
      const params = new URLSearchParams();
      if (currentSearchQuery) params.append('q', currentSearchQuery);
      if (currentFilters.type) params.append('type', currentFilters.type);
      else params.append('type', 'video');

      const searchResponse = await axios.get(`/api/subprojects/${currentSubproject}/files/search?${params.toString()}`);
      files = searchResponse.data.filter(f => getFileType(f) === 'video');
    } else {
      const filesResponse = await axios.get(`/api/subprojects/${currentSubproject}/files/all`);
      files = filesResponse.data.filter(f => getFileType(f) === 'video');
    }

    const currentIndex = files.findIndex(f => f.id === fileId);
    const currentFile = files.find(f => f.id === fileId);
    const displayFileName = currentFile?.name || fileName;

    const prevId = currentIndex > 0 ? files[currentIndex - 1].id : null;
    const nextId = currentIndex >= 0 && currentIndex < files.length - 1 ? files[currentIndex + 1].id : null;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50';
    modal.innerHTML = `
      <button type="button" data-video-preview-close class="fixed top-4 right-4 text-white hover:text-gray-300 z-20 bg-black bg-opacity-50 rounded-full p-2">
        <i class="fas fa-times text-xl"></i>
      </button>
      ${prevId ? `
        <button type="button" data-preview-nav="prev" class="fixed left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 z-20 bg-black bg-opacity-50 rounded-full p-3">
          <i class="fas fa-chevron-left"></i>
        </button>
      ` : ''}
      ${nextId ? `
        <button type="button" data-preview-nav="next" class="fixed right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 z-20 bg-black bg-opacity-50 rounded-full p-3">
          <i class="fas fa-chevron-right"></i>
        </button>
      ` : ''}
      <div class="relative max-w-7xl max-h-full p-4 flex flex-col items-center justify-center">
        <h3 class="text-white font-semibold mb-2 self-stretch text-center">${escapeHtml(displayFileName)}</h3>
        <video src="${previewUrl}" controls class="max-w-full max-h-[90vh]" type="${mimeType}" data-preview-main-media>
          お使いのブラウザは動画タグをサポートしていません。
        </video>
        <p class="text-sm text-white opacity-75 mt-2">${currentIndex >= 0 ? currentIndex + 1 : '?'} / ${files.length}</p>
      </div>
    `;

    document.body.appendChild(modal);

    const handleClose = () => {
      cleanupPreviewKeydownNav();
      modal.remove();
    };
    modal.querySelector('[data-video-preview-close]')?.addEventListener('click', handleClose);

    const go = (targetId) => {
      if (!targetId) return;
      cleanupPreviewKeydownNav();
      modal.remove();
      showVideoPreview(targetId);
    };
    modal.querySelector('[data-preview-nav="prev"]')?.addEventListener('click', () => go(prevId));
    modal.querySelector('[data-preview-nav="next"]')?.addEventListener('click', () => go(nextId));

    modal.querySelector('[data-preview-main-media]')?.addEventListener('error', () => {
      cleanupPreviewKeydownNav();
      alert('動画の読み込みに失敗しました');
      modal.remove();
    }, { once: true });

    attachPreviewKeydownNav(modal, prevId, nextId, showVideoPreview);
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
            <button onclick="restoreFileVersion('${escapeJsString(fileId)}', ${version.id})" class="mt-2 w-full bg-blue-500 text-white text-xs py-1 px-3 rounded hover:bg-blue-600 transition">
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
    try {
      currentUser = JSON.parse(savedUser);
    } catch (e) {
      currentUser = null;
      localStorage.removeItem('user');
      showLoginPage();
      return;
    }

    // 旧実装の数値IDが残っている場合は破棄して再ログインさせる（UUID前提のため、ゲストは例外）
    if (!currentUser || (currentUser.id !== 'guest' && !isUuid(currentUser.id))) {
      currentUser = null;
      localStorage.removeItem('user');
      showLoginPage();
      return;
    }

    showProjectsPage();
  } else {
    showLoginPage();
  }
});
