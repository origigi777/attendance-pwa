
const API_BASE = (location.hostname === 'localhost' ? 'http://localhost:4000' : '') + '/api';

const storage = {
  saveToken: (t) => localStorage.setItem('token', t),
  getToken: () => localStorage.getItem('token'),
  saveUser: (u) => localStorage.setItem('user', JSON.stringify(u)),
  getUser: () => JSON.parse(localStorage.getItem('user'))
};

async function apiFetch(path, opts = {}) {
  const token = storage.getToken();
  const headers = opts.headers || {};
  headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = 'Bearer ' + token;
  opts.headers = headers;
  const res = await fetch(API_BASE + path, opts);
  if (res.status === 401 || res.status === 403) {
    window.location = '/login.html';
    throw new Error('Unauthorized');
  }
  return res.json();
}

document.addEventListener('submit', async (e)=> {
  if (e.target.id === 'signupForm') {
    e.preventDefault();
    const id_number = document.getElementById('su_id_number').value.trim();
    const full_name = document.getElementById('su_full_name').value.trim();
    const email = document.getElementById('su_email').value.trim();
    const phone = document.getElementById('su_phone').value.trim();
    try {
      const r = await fetch(API_BASE + '/auth/signup', {
        method: 'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id_number, full_name, email, phone })
      });
      const data = await r.json();
      if (!r.ok) return alert(data.message || 'Error');
      storage.saveToken(data.token);
      storage.saveUser(data.user);
      window.location = '/index.html';
    } catch (err) { console.error(err); alert('Error'); }
  }

  if (e.target.id === 'loginForm') {
    e.preventDefault();
    const id_number = document.getElementById('id_number').value.trim();
    fetch(API_BASE + '/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id_number })
    }).then(r=>r.json()).then(data=>{
      if (data.token) {
        storage.saveToken(data.token);
        storage.saveUser(data.user);
        window.location = '/index.html';
      } else {
        alert(data.message || 'Login failed');
      }
    }).catch(()=>alert('Error'));
  }

  if (e.target.id === 'eventForm') {
    e.preventDefault();
    const event_date = document.getElementById('event_date').value;
    const type = document.getElementById('type').value;
    const notes = document.getElementById('notes').value;

    if (!event_date) {
      alert('יש לבחור תאריך');
      return;
    }
    if (type === 'אחר' && !notes.trim()) {
      alert('בסוג "אחר" חובה למלא הערות / פירוט');
      return;
    }

    apiFetch('/events', { method:'POST', body: JSON.stringify({ event_date, type, notes }) })
      .then(()=> { alert('האירוע נשמר'); location.reload(); })
      .catch(err => { console.error(err); alert('שגיאה בשמירה'); });
  }

  if (e.target.id === 'colorForm') {
    e.preventDefault();
    const input = document.getElementById('my_color');
    if (!input) return;
    const color = input.value;
    apiFetch('/users/me/color', { method: 'PUT', body: JSON.stringify({ color }) })
      .then(data => {
        if (data && data.user) {
          storage.saveUser(data.user);
        }
        alert('הצבע עודכן');
        location.reload();
      })
      .catch(err => { console.error(err); alert('שגיאה בעדכון הצבע'); });
  }

});
document.addEventListener('click', (e)=>{
  if (e.target.id === 'btn-logout') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location = '/login.html';
  }
});

const app = {
  setUserInfo: function() {
    const user = storage.getUser();
    if (!user) return;
    const ui = document.getElementById('user-info');
    if (ui) ui.innerText = `${user.full_name} (${user.role})`;
  },

  initCalendar: async function() {
    const token = storage.getToken();
    if (!token) { window.location = '/login.html'; return; }
    app.setUserInfo();

    let events = [];
    try {
      const eventsRaw = await apiFetch('/events');
      events = eventsRaw.map(ev => ({
        id: ev.id,
        title: `${ev.full_name} — ${ev.type}`,
        start: ev.event_date,
        backgroundColor: ev.color || '#2563eb',
        borderColor: ev.color || '#2563eb',
        extendedProps: { notes: ev.notes, id_number: ev.id_number }
      }));
    } catch (err) {
      console.error('Failed to load events for team calendar', err);
      events = [];
    }

    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;
    const calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      locale: 'he',
      headerToolbar: { left:'prev,next today', center:'title', right:'dayGridMonth,timeGridWeek,timeGridDay' },
      events,
      eventClick: function(info) {
        alert(info.event.title + "\\n" + (info.event.extendedProps.notes || ''));
      }
    });
    calendar.render();
  },


  initMyEventsCalendar: async function() {
    const token = storage.getToken();
    if (!token) { window.location = '/login.html'; return; }
    app.setUserInfo();

    let events = [];
    try {
      const eventsRaw = await apiFetch('/events/mine');
      events = eventsRaw.map(ev => ({
        id: ev.id,
        title: `${ev.type}${ev.notes ? ' — ' + ev.notes : ''}`,
        start: ev.event_date,
        backgroundColor: ev.color || (storage.getUser() && storage.getUser().color) || '#2563eb',
        borderColor: ev.color || (storage.getUser() && storage.getUser().color) || '#2563eb',
        extendedProps: { notes: ev.notes }
      }));
    } catch (err) {
      console.error('Failed to load personal events calendar', err);
      events = [];
    }

    const calEl = document.getElementById('myCalendar');
    if (!calEl) return;

    const calendar = new FullCalendar.Calendar(calEl, {
      initialView: 'dayGridMonth',
      locale: 'he',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      events,
      dateClick: function(info) {
        const dateInput = document.getElementById('event_date');
        if (dateInput) {
          dateInput.value = info.dateStr;
        }
      },
      eventClick: function(info) {
        alert(info.event.title + "\n" + (info.event.extendedProps.notes || ''));
      }
    });

    calendar.render();
  },

  loadMyEventsList: async function() {
    app.setUserInfo();
    const data = await apiFetch('/events/mine');
    const ul = document.getElementById('myEventsList');
    if (!ul) return;

    ul.innerHTML = '';

    data.forEach(ev => {
      const li = document.createElement('li');

      // טקסט האירוע
      const span = document.createElement('span');
      span.textContent = `${ev.event_date} — ${ev.type} ${ev.notes ? ' — ' + ev.notes : ''}`;
      li.appendChild(span);

      // כפתור מחיקה
      const btn = document.createElement('button');
      btn.textContent = 'מחק';
      btn.className = 'btn-secondary btn-delete-event';
      btn.dataset.id = ev.id; // מזהה האירוע למחיקה
      li.appendChild(btn);

      ul.appendChild(li);
    });

    // מאזין למחיקה
    ul.onclick = async (e) => {
      const target = e.target;
      if (!target || !target.classList.contains('btn-delete-event')) return;

      const id = target.dataset.id;
      if (!id) return;

      const ok = confirm('האם אתה בטוח שברצונך למחוק את האירוע?');
      if (!ok) return;

      try {
        await apiFetch(`/events/${id}`, { method: 'DELETE' });
        alert('האירוע נמחק');
        app.loadMyEventsList();

        // רענון יומן אישי אם קיים
        if (document.body.contains(document.querySelector('#myCalendar'))) {
          app.initMyEventsCalendar();
        }

      } catch (err) {
        console.error(err);
        alert('שגיאה במחיקת אירוע');
      }
    };
  },


  
  exportTeamCalendar: async function() {
    const token = storage.getToken && storage.getToken();
    if (!token) {
      window.location = '/login.html';
      return;
    }
    try {
      const response = await fetch(API_BASE + '/events/export', {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });
      if (!response.ok) {
        alert('שגיאה בייצוא היומן');
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'team-calendar-' + new Date().toISOString().slice(0,10) + '.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('שגיאה בייצוא היומן');
    }
  },

loadUsersForAdmin: async function() {
    const tbl = document.querySelector('#usersTable tbody');
    if (!tbl) return;
    const data = await apiFetch('/users');
    tbl.innerHTML = '';
    data.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${u.id_number}</td>
        <td>${u.full_name}</td>
        <td>${u.role}</td>
        <td>
          <input type="color" value="${u.color || '#2563eb'}" data-id="${u.id}" class="user-color-input" />
        </td>
        <td>
          <button data-id="${u.id}" data-role="staff">קדם לסגל</button>
          <button data-id="${u.id}" data-role="developer">הורד למפתח</button>
        </td>
        <td>
          <button data-id="${u.id}" class="btn-delete-user">מחק</button>
        </td>
      `;
      tbl.appendChild(tr);
    });

    tbl.addEventListener('change', async (e) => {
      if (e.target.classList.contains('user-color-input')) {
        const id = e.target.dataset.id;
        const color = e.target.value;
        try {
          await apiFetch(`/users/${id}/color`, { method: 'PUT', body: JSON.stringify({ color }) });
          alert('צבע עודכן');
        } catch (err) {
          console.error(err);
          alert('שגיאה בעדכון צבע');
        }
      }
    });

    tbl.addEventListener('click', async (e) => {
      // delete user
      if (e.target.classList.contains('btn-delete-user')) {
        const id = e.target.dataset.id;
        if (!confirm('למחוק את המשתמש הזה וכל האירועים שלו?')) return;
        try {
          await apiFetch(`/users/${id}`, { method: 'DELETE' });
          alert('המשתמש נמחק');
          app.loadUsersForAdmin();
        } catch (err) {
          console.error(err);
          alert('שגיאה במחיקת משתמש');
        }
        return;
      }

      // change role
      if (e.target.tagName === 'BUTTON' && e.target.dataset.role) {
        const id = e.target.dataset.id;
        const role = e.target.dataset.role;
        try {
          await apiFetch(`/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) });
          alert('Role updated');
          app.loadUsersForAdmin();
        } catch (err) {
          console.error(err);
          alert('שגיאה בעדכון תפקיד');
        }
      }
    });
    // load all events for admin view
    const evs = await apiFetch('/events');
    const all = document.getElementById('allEvents');
    all.innerHTML = '<ul>' + evs.map(ev => `<li>${ev.event_date} — ${ev.full_name} — ${ev.type} ${ev.notes ? ' — ' + ev.notes : ''}</li>`).join('') + '</ul>';
  }
};

if (document.body.contains(document.querySelector('#usersTable'))) {
  app.loadUsersForAdmin();
}

if (document.body.contains(document.querySelector('#myEventsList'))) {
  app.loadMyEventsList();
}


if (document.body.contains(document.querySelector('#myCalendar'))) {
  app.initMyEventsCalendar();
}



if (document.body.contains(document.querySelector('#my_color'))) {
  const user = storage.getUser && storage.getUser();
  const input = document.getElementById('my_color');
  if (input) {
    if (user && user.color) {
      input.value = user.color;
    }
    // initial background
    input.style.backgroundColor = input.value || '#2563eb';
    // live update on change
    input.addEventListener('input', () => {
      input.style.backgroundColor = input.value || '#2563eb';
    });
  }
}
// Hide admin navigation link for non-staff users
document.addEventListener('DOMContentLoaded', () => {
  try {
    const user = storage.getUser && storage.getUser();
    const adminLinks = document.querySelectorAll('nav.app-nav a[href="/admin.html"], #adminLink');
    if (!adminLinks || adminLinks.length === 0) return;
    if (!user || user.role !== 'staff') {
      adminLinks.forEach(el => {
        if (el) el.style.display = 'none';
      });
    }
  } catch (e) {
    // ignore
  }
});


const exportBtn = document.querySelector('#exportExcelBtn');
if (exportBtn && app.exportTeamCalendar) {
  exportBtn.addEventListener('click', () => {
    app.exportTeamCalendar();
  });
}

// register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(()=>console.log('SW registered')).catch(()=>{});
}
