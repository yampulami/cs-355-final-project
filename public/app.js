const API = '';
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');
let receipts = [];

// --- API Helper ---
async function api(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// --- Auth ---
function showRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
  document.getElementById('auth-error').textContent = '';
}

function showLogin() {
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('auth-error').textContent = '';
}

async function login() {
  try {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const data = await api('/api/login', 'POST', { email, password });
    setAuth(data);
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
}

async function register() {
  try {
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const data = await api('/api/register', 'POST', { username, email, password });
    setAuth(data);
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
}

function setAuth(data) {
  token = data.token;
  user = data.user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  showApp();
}

function logout() {
  token = null;
  user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'block';
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  document.getElementById('user-greeting').textContent = 'Hi, ' + user.username;
  showSection('dashboard');
}

// --- Sections ---
function showSection(name) {
  document.getElementById('dashboard-section').style.display = name === 'dashboard' ? 'block' : 'none';
  document.getElementById('receipts-section').style.display = name === 'receipts' ? 'block' : 'none';
  document.getElementById('profile-section').style.display = name === 'profile' ? 'block' : 'none';
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.textContent.toLowerCase() === name) btn.classList.add('active');
  });

  if (name === 'dashboard') loadDashboard();
  if (name === 'receipts') loadReceipts();
  if (name === 'profile') loadProfile();
}

// --- Dashboard ---
async function loadDashboard() {
  try {
    const data = await api('/api/dashboard');
    document.getElementById('stat-total-receipts').textContent = data.totalReceipts;
    document.getElementById('stat-total-spending').textContent = '$' + data.totalSpending.toFixed(2);
    document.getElementById('stat-monthly').textContent = '$' + data.monthlySpending.toFixed(2);
    document.getElementById('stat-expiring').textContent = data.expiringSoon;

    // Expiring items
    const expiringEl = document.getElementById('expiring-list');
    if (data.expiringSoonItems.length === 0) {
      expiringEl.innerHTML = '<p class="empty-state">No items expiring soon</p>';
    } else {
      expiringEl.innerHTML = data.expiringSoonItems.map(r => {
        const daysLeft = getDaysLeft(r.returnDeadline);
        const urgency = daysLeft <= 2 ? 'urgent' : 'soon';
        return `<div class="expiring-item">
          <span>${r.itemName} - ${r.storeName}</span>
          <span class="days-left ${urgency}">${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</span>
        </div>`;
      }).join('');
    }

    // Categories
    const catEl = document.getElementById('category-breakdown');
    const cats = data.categories;
    const maxCat = Math.max(...Object.values(cats), 1);
    if (Object.keys(cats).length === 0) {
      catEl.innerHTML = '<p class="empty-state">No data yet</p>';
    } else {
      catEl.innerHTML = Object.entries(cats).map(([cat, amount]) =>
        `<div class="category-row">
          <span>${cat}</span>
          <div class="category-bar"><div class="category-bar-fill" style="width:${(amount/maxCat)*100}%"></div></div>
          <span>$${amount.toFixed(2)}</span>
        </div>`
      ).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

// --- Receipts ---
async function loadReceipts() {
  try {
    receipts = await api('/api/receipts');
    renderReceipts();
  } catch (err) {
    console.error(err);
  }
}

function renderReceipts() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const catFilter = document.getElementById('filter-category').value;

  let filtered = receipts.filter(r => {
    const matchSearch = r.storeName.toLowerCase().includes(search) ||
                        r.itemName.toLowerCase().includes(search);
    const matchCat = !catFilter || r.category === catFilter;
    return matchSearch && matchCat;
  });

  const listEl = document.getElementById('receipts-list');
  if (filtered.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No receipts found. Add your first receipt!</p>';
    return;
  }

  listEl.innerHTML = filtered.map(r => {
    let deadlineHtml = '';
    if (r.returnDeadline) {
      const daysLeft = getDaysLeft(r.returnDeadline);
      if (daysLeft < 0) {
        deadlineHtml = '<div class="receipt-deadline" style="color:#e53e3e">Return expired</div>';
      } else {
        const urgency = daysLeft <= 3 ? 'color:#e53e3e' : daysLeft <= 7 ? 'color:#d97706' : 'color:#16a34a';
        deadlineHtml = `<div class="receipt-deadline" style="${urgency}">${daysLeft} day${daysLeft !== 1 ? 's' : ''} to return</div>`;
      }
    }
    return `<div class="receipt-card">
      <div class="receipt-info">
        <h3>${r.itemName} <span class="badge">${r.category}</span></h3>
        <p>${r.storeName} &middot; ${formatDate(r.purchaseDate)}</p>
      </div>
      <div class="receipt-meta">
        <div class="receipt-price">$${r.price.toFixed(2)}</div>
        ${deadlineHtml}
        <div class="receipt-actions">
          <button class="btn-edit" onclick='editReceipt("${r._id}")'>Edit</button>
          <button class="btn-delete" onclick='deleteReceipt("${r._id}")'>Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// --- Modal ---
function openReceiptModal() {
  document.getElementById('modal-title').textContent = 'Add Receipt';
  document.getElementById('receipt-id').value = '';
  document.getElementById('receipt-store').value = '';
  document.getElementById('receipt-item').value = '';
  document.getElementById('receipt-price').value = '';
  document.getElementById('receipt-category').value = 'Other';
  document.getElementById('receipt-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('receipt-deadline').value = '';
  document.getElementById('modal-error').textContent = '';
  document.getElementById('scan-status').innerHTML = '';
  document.getElementById('scan-preview').style.display = 'none';
  document.getElementById('scan-section').style.display = 'block';
  document.getElementById('scan-upload').value = '';
  document.getElementById('scan-camera').value = '';
  document.getElementById('receipt-modal').style.display = 'flex';
}

async function scanReceipt(input) {
  const file = input.files[0];
  if (!file) return;

  // Show preview
  const preview = document.getElementById('scan-preview');
  const previewImg = document.getElementById('scan-preview-img');
  preview.style.display = 'block';
  previewImg.src = URL.createObjectURL(file);

  const statusEl = document.getElementById('scan-status');
  statusEl.className = 'scan-status';
  statusEl.innerHTML = '<span class="spinner"></span> Analyzing receipt...';

  try {
    const formData = new FormData();
    formData.append('receipt', file);

    const res = await fetch('/api/scan-receipt', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Auto-populate fields
    if (data.storeName) document.getElementById('receipt-store').value = data.storeName;
    if (data.purchaseDate) document.getElementById('receipt-date').value = data.purchaseDate;
    if (data.category) document.getElementById('receipt-category').value = data.category;

    // If multiple items, join names and use total price
    if (data.items && data.items.length > 0) {
      document.getElementById('receipt-item').value = data.items.map(i => i.name).join(', ');
    }
    if (data.totalPrice) {
      document.getElementById('receipt-price').value = data.totalPrice;
    } else if (data.items && data.items.length > 0) {
      const total = data.items.reduce((s, i) => s + (i.price || 0), 0);
      document.getElementById('receipt-price').value = total.toFixed(2);
    }

    statusEl.innerHTML = 'Receipt scanned! Review and edit the fields below.';
  } catch (err) {
    statusEl.className = 'scan-status error';
    statusEl.textContent = 'Scan failed: ' + err.message;
  }
}

function closeReceiptModal() {
  document.getElementById('receipt-modal').style.display = 'none';
}

function editReceipt(id) {
  const r = receipts.find(r => r._id === id);
  if (!r) return;
  document.getElementById('scan-section').style.display = 'none';
  document.getElementById('modal-title').textContent = 'Edit Receipt';
  document.getElementById('receipt-id').value = r._id;
  document.getElementById('receipt-store').value = r.storeName;
  document.getElementById('receipt-item').value = r.itemName;
  document.getElementById('receipt-price').value = r.price;
  document.getElementById('receipt-category').value = r.category;
  document.getElementById('receipt-date').value = r.purchaseDate;
  document.getElementById('receipt-deadline').value = r.returnDeadline || '';
  document.getElementById('modal-error').textContent = '';
  document.getElementById('receipt-modal').style.display = 'flex';
}

async function saveReceipt() {
  const id = document.getElementById('receipt-id').value;
  const body = {
    storeName: document.getElementById('receipt-store').value,
    itemName: document.getElementById('receipt-item').value,
    price: document.getElementById('receipt-price').value,
    category: document.getElementById('receipt-category').value,
    purchaseDate: document.getElementById('receipt-date').value,
    returnDeadline: document.getElementById('receipt-deadline').value || null
  };

  try {
    if (id) {
      await api('/api/receipts/' + id, 'PUT', body);
    } else {
      await api('/api/receipts', 'POST', body);
    }
    closeReceiptModal();
    loadReceipts();
  } catch (err) {
    document.getElementById('modal-error').textContent = err.message;
  }
}

async function deleteReceipt(id) {
  if (!confirm('Delete this receipt?')) return;
  try {
    await api('/api/receipts/' + id, 'DELETE');
    loadReceipts();
  } catch (err) {
    alert(err.message);
  }
}

// --- Profile ---
async function loadProfile() {
  // Pre-fill from local data immediately so fields aren't empty
  document.getElementById('profile-username').value = user?.username || '';
  document.getElementById('profile-email').value = user?.email || '';
  document.getElementById('profile-msg').textContent = '';
  document.getElementById('password-msg').textContent = '';
  document.getElementById('profile-current-pw').value = '';
  document.getElementById('profile-new-pw').value = '';
  try {
    const data = await api('/api/profile');
    document.getElementById('profile-username').value = data.username;
    document.getElementById('profile-email').value = data.email;
    document.getElementById('profile-joined').value = new Date(data.createdAt).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
  } catch (err) {
    console.error('Profile load error:', err);
  }
}

async function updateProfile() {
  const msgEl = document.getElementById('profile-msg');
  try {
    const username = document.getElementById('profile-username').value;
    const email = document.getElementById('profile-email').value;
    const data = await api('/api/profile', 'PUT', { username, email });
    // Update local auth with new token
    token = data.token;
    user = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    document.getElementById('user-greeting').textContent = 'Hi, ' + user.username;
    msgEl.style.color = '#16a34a';
    msgEl.textContent = 'Profile updated!';
  } catch (err) {
    msgEl.style.color = '#e53e3e';
    msgEl.textContent = err.message;
  }
}

async function changePassword() {
  const msgEl = document.getElementById('password-msg');
  try {
    const currentPassword = document.getElementById('profile-current-pw').value;
    const newPassword = document.getElementById('profile-new-pw').value;
    await api('/api/profile/password', 'PUT', { currentPassword, newPassword });
    msgEl.style.color = '#16a34a';
    msgEl.textContent = 'Password updated!';
    document.getElementById('profile-current-pw').value = '';
    document.getElementById('profile-new-pw').value = '';
  } catch (err) {
    msgEl.style.color = '#e53e3e';
    msgEl.textContent = err.message;
  }
}

async function deleteAccount() {
  if (!confirm('Are you sure? This will permanently delete your account and all receipts.')) return;
  if (!confirm('This CANNOT be undone. Delete account?')) return;
  try {
    await api('/api/profile', 'DELETE');
    logout();
  } catch (err) {
    alert(err.message);
  }
}

// --- Helpers ---
function getDaysLeft(deadline) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const d = new Date(deadline);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d - now) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
}

// --- Init ---
if (token && user) {
  showApp();
} else {
  document.getElementById('auth-screen').style.display = 'block';
}
