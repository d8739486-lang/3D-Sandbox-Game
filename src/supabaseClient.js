// ============================================================================
// --- МОДУЛЬ ИНТЕГРАЦИИ С ОБЛАКОМ SUPABASE (АККАУНТЫ, НИКИ, АВАТАРКИ, СЕЙВЫ) ---
// ============================================================================

/**
 * Хранилище конфигурации подключения к вашему проекту Supabase.
 * Для активации укажите ваши Project URL и Anon Public API Key.
 * Вы можете ввести их через настройки игры, либо вставить ниже.
 */
export const SUPABASE_CONFIG = {
  url: localStorage.getItem('sbx_supabase_url') || '',
  anonKey: localStorage.getItem('sbx_supabase_anon_key') || '',
  isConfigured: false
};

// Проверяем наличие ключей
if (SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
  SUPABASE_CONFIG.isConfigured = true;
}

// Текущая локальная сессия пользователя (Гость или Авторизованный аккаунт)
export const currentUserSession = {
  isAuthenticated: false,
  id: localStorage.getItem('sbx_user_id') || ('guest_' + Math.random().toString(36).substring(2, 9)),
  email: null,
  nickname: localStorage.getItem('sbx_player_nick') || ('Игрок_' + Math.floor(1000 + Math.random() * 9000)),
  avatarUrl: localStorage.getItem('sbx_avatar_url') || null,
  role: 'player'
};

/**
 * Проверка, подключен ли Supabase
 */
export function isSupabaseReady() {
  return !!(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
}

/**
 * Инициализация / обновление настроек Supabase
 */
export function configureSupabase(url, anonKey) {
  if (!url || !anonKey) return false;
  SUPABASE_CONFIG.url = url.trim();
  SUPABASE_CONFIG.anonKey = anonKey.trim();
  SUPABASE_CONFIG.isConfigured = true;

  try {
    localStorage.setItem('sbx_supabase_url', SUPABASE_CONFIG.url);
    localStorage.setItem('sbx_supabase_anon_key', SUPABASE_CONFIG.anonKey);
  } catch (_) {}

  return true;
}

/**
 * HTTP запрос к REST API Supabase без тяжелых зависимостей
 */
async function supabaseRest(endpoint, method = 'GET', body = null, token = null) {
  if (!isSupabaseReady()) {
    throw new Error('Supabase еще не настроен. Укажите Project URL и Anon Key.');
  }

  const headers = {
    'apikey': SUPABASE_CONFIG.anonKey,
    'Authorization': `Bearer ${token || SUPABASE_CONFIG.anonKey}`,
    'Content-Type': 'application/json'
  };

  const response = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Supabase error (${response.status}): ${errText}`);
  }

  return response.json();
}

/**
 * Регистрация нового аккаунта через Supabase Auth
 */
export async function registerSupabaseAccount(email, password, nickname) {
  if (!isSupabaseReady()) {
    // Локальный режим
    currentUserSession.nickname = nickname || currentUserSession.nickname;
    localStorage.setItem('sbx_player_nick', currentUserSession.nickname);
    return { success: true, localOnly: true, user: currentUserSession };
  }

  const resp = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_CONFIG.anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email,
      password,
      data: { nickname: nickname || 'Игрок' }
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.msg || data.error_description || 'Ошибка регистрации');
  }

  if (data.user) {
    currentUserSession.isAuthenticated = true;
    currentUserSession.id = data.user.id;
    currentUserSession.email = data.user.email;
    currentUserSession.nickname = nickname || data.user.email.split('@')[0];
    localStorage.setItem('sbx_user_id', currentUserSession.id);
    localStorage.setItem('sbx_player_nick', currentUserSession.nickname);
  }

  return { success: true, user: currentUserSession, data };
}

/**
 * Вход в существующий аккаунт Supabase Auth
 */
export async function loginSupabaseAccount(email, password) {
  if (!isSupabaseReady()) {
    throw new Error('Supabase не подключен. Работает локальный режим гостя.');
  }

  const resp = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_CONFIG.anonKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error_description || data.msg || 'Неверный логин или пароль');
  }

  if (data.access_token && data.user) {
    currentUserSession.isAuthenticated = true;
    currentUserSession.id = data.user.id;
    currentUserSession.email = data.user.email;
    currentUserSession.nickname = (data.user.user_metadata && data.user.user_metadata.nickname) || data.user.email.split('@')[0];
    localStorage.setItem('sbx_auth_token', data.access_token);
    localStorage.setItem('sbx_user_id', currentUserSession.id);
    localStorage.setItem('sbx_player_nick', currentUserSession.nickname);
  }

  return { success: true, user: currentUserSession, token: data.access_token };
}

/**
 * Обновление никнейма профиля
 */
export function setPlayerNick(nick) {
  if (!nick || !nick.trim()) return;
  const clean = nick.trim().substring(0, 20);
  currentUserSession.nickname = clean;
  localStorage.setItem('sbx_player_nick', clean);
  return clean;
}
