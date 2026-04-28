// ── Supabase client ───────────────────────────────────────────────────────────

window.supa = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Session check on load ─────────────────────────────────────────────────────

async function checkSession() {
  const { data: { session } } = await supa.auth.getSession();
  if (session) {
    const profile = await fetchProfile(session.user.id);
    enterApp(profile);
  } else {
    showAuthOverlay();
  }
}

async function fetchProfile(userId) {
  const { data } = await supa
    .from('profiles')
    .select('name, phone')
    .eq('id', userId)
    .single();
  return data;
}

function enterApp(profile) {
  window.currentProfile = profile;
  document.getElementById('authOverlay').classList.remove('active');
  document.getElementById('userNameDisplay').textContent = profile?.name ?? '';
  document.getElementById('userBar').style.display = 'flex';
  initApp(); // defined in app.js
}

function showAuthOverlay() {
  document.getElementById('authOverlay').classList.add('active');
  document.getElementById('loadingOverlay').style.display = 'none';
}

// ── Tab switch ────────────────────────────────────────────────────────────────

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  document.getElementById('loginForm').classList.toggle('hidden', tab !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', tab !== 'register');
  document.getElementById('loginError').textContent = '';
  document.getElementById('registerError').textContent = '';
}

// ── Login ─────────────────────────────────────────────────────────────────────

document.getElementById('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const phone    = document.getElementById('loginPhone').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  const btn      = e.target.querySelector('button[type="submit"]');

  if (!phone || !password) { errEl.textContent = '請填寫所有欄位'; return; }

  btn.disabled = true;
  btn.textContent = '登入中...';
  errEl.textContent = '';

  try {
    const { data, error } = await supa.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password,
    });
    if (error) throw error;

    const profile = await fetchProfile(data.user.id);
    enterApp(profile);
  } catch {
    errEl.textContent = '手機號碼或密碼錯誤';
  } finally {
    btn.disabled = false;
    btn.textContent = '登入';
  }
});

// ── Register ──────────────────────────────────────────────────────────────────

document.getElementById('registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name     = document.getElementById('regName').value.trim();
  const phone    = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPassword').value;
  const errEl    = document.getElementById('registerError');
  const btn      = e.target.querySelector('button[type="submit"]');

  if (!name || !phone || !password) { errEl.textContent = '請填寫所有欄位'; return; }
  if (password.length < 6)          { errEl.textContent = '密碼至少需要 6 個字元'; return; }

  btn.disabled = true;
  btn.textContent = '註冊中...';
  errEl.textContent = '';

  try {
    // 檢查手機是否已被使用
    const { data: exists } = await supa.rpc('check_phone_exists', { p_phone: phone });
    if (exists) { errEl.textContent = '此手機號碼已經註冊過了'; return; }

    // 建立 Auth 帳號
    const { data, error } = await supa.auth.signUp({
      email: phoneToEmail(phone),
      password,
    });
    if (error) throw error;

    // 寫入 profiles
    const { error: profileErr } = await supa
      .from('profiles')
      .insert({ id: data.user.id, name, phone });
    if (profileErr) throw profileErr;

    enterApp({ name, phone });
  } catch (err) {
    errEl.textContent = err.message ?? '註冊失敗，請稍後再試';
  } finally {
    btn.disabled = false;
    btn.textContent = '建立帳號';
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────

async function logout() {
  await supa.auth.signOut();
  location.reload();
}

// ── Helper ────────────────────────────────────────────────────────────────────

function phoneToEmail(phone) {
  return `${phone.replace(/\s+/g, '')}@baccarat.local`;
}

// ── Start ─────────────────────────────────────────────────────────────────────
checkSession();
