/**
 * Plan del día — configuración por toques + registro rápido
 * Zona: Europe/Madrid · localStorage: paradas-gps-plan-dia
 */
(function () {
  "use strict";

  const PLAN_KEY = "paradas-gps-plan-dia";
  const EVENTS_KEY = "paradas-gps-v1";
  const CLIENTES_KEY = "paradas-gps-clientes";
  const TIPOS_KEY = "paradas-gps-tipos-cliente";
  const TZ = "Europe/Madrid";
  const CREW = ["Haydee", "Adriana", "Virginia", "Joy", "Mikael"];
  const MIN_DURATION = 5;
  const BASE_MIN_PER_STOP_AT_2 = 20; // 60 min / 3 comunidades / 2 personas
  const QUICK_NAMES = ["Coroso 1", "Coroso 2", "Coroso 3"];

  const DEFAULT_TIPOS = [
    { id: "comunidad", nombre: "Comunidad" },
    { id: "piso", nombre: "Piso" },
    { id: "casa", nombre: "Casa" },
    { id: "oficina", nombre: "Oficina" },
  ];

  const $ = (sel) => document.querySelector(sel);

  // DOM
  const setupPanel = $("#setupPanel");
  const dayPanel = $("#dayPanel");
  const inputFecha = $("#inputFecha");
  const inputHoraInicio = $("#inputHoraInicio");
  const inputHoraFin = $("#inputHoraFin");
  const checkOverrideEnd = $("#checkOverrideEnd");
  const overrideEndRow = $("#overrideEndRow");
  const crewToggles = $("#crewToggles");
  const crewHint = $("#crewHint");
  const quickChips = $("#quickChips");
  const searchParadas = $("#searchParadas");
  const paradaPickList = $("#paradaPickList");
  const selectedStops = $("#selectedStops");
  const estCrew = $("#estCrew");
  const estStops = $("#estStops");
  const estDuration = $("#estDuration");
  const estEnd = $("#estEnd");
  const setupStatus = $("#setupStatus");
  const dayStatus = $("#dayStatus");
  const dayFecha = $("#dayFecha");
  const bloquesList = $("#bloquesList");
  const regOverlay = $("#regOverlay");
  const regStopName = $("#regStopName");
  const regGpsStatus = $("#regGpsStatus");
  const regSinGps = $("#regSinGps");
  const regTipoToggles = $("#regTipoToggles");

  /** @type {{ id: string, tipo: string, nombre: string }[]} */
  let clientes = [];
  /** @type {{ id: string, nombre: string }[]} */
  let tipos = [];
  /** @type {string[]} selected cliente ids for current bloque draft */
  let draftStopIds = [];
  /** @type {string|null} bloque id being edited, or null = new */
  let editingBloqueId = null;
  /** Pending register sheet state */
  let pendingReg = null;
  let regGeo = { lat: null, lng: null, accuracy_m: null, pending: false, error: null };
  let regEventoTipo = "Traslado personal";

  // ——— Utils ———
  function uid() {
    return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeText(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function todayYmdMadrid() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  function nowHmMadrid() {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const h = parts.find((p) => p.type === "hour")?.value || "00";
    const m = parts.find((p) => p.type === "minute")?.value || "00";
    return `${h === "24" ? "00" : h}:${m}`;
  }

  function madridIso(ymd, hh, mm, ss) {
    const [y, mo, d] = ymd.split("-").map(Number);
    const guess = new Date(Date.UTC(y, mo - 1, d, hh, mm, ss || 0));
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(guess).map((p) => [p.type, p.value])
    );
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === "24" ? 0 : parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const target = Date.UTC(y, mo - 1, d, hh, mm, ss || 0);
    return new Date(guess.getTime() + (target - asUtc)).toISOString();
  }

  function parseHm(hm) {
    const m = String(hm || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return { h: Number(m[1]), m: Number(m[2]) };
  }

  function addMinutesHm(hm, mins) {
    const p = parseHm(hm);
    if (!p) return "—";
    let total = p.h * 60 + p.m + mins;
    total = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
    const hh = String(Math.floor(total / 60)).padStart(2, "0");
    const mm = String(total % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  function adjustHm(hm, delta) {
    return addMinutesHm(hm || nowHmMadrid(), delta);
  }

  function formatDuration(mins) {
    if (!Number.isFinite(mins) || mins <= 0) return "—";
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  /** duration_min = round(K * 20 * (2 / N)), N>=1, min 5 */
  function estimateDurationMin(K, N) {
    const n = Math.max(1, Number(N) || 0);
    const k = Math.max(0, Number(K) || 0);
    if (k === 0) return 0;
    return Math.max(MIN_DURATION, Math.round(k * BASE_MIN_PER_STOP_AT_2 * (2 / n)));
  }

  // ——— Storage ———
  function loadTipos() {
    try {
      const raw = localStorage.getItem(TIPOS_KEY);
      if (!raw) return DEFAULT_TIPOS.slice();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_TIPOS.slice();
      return parsed
        .filter((t) => t && t.id && t.nombre)
        .map((t) => ({ id: String(t.id), nombre: String(t.nombre) }));
    } catch {
      return DEFAULT_TIPOS.slice();
    }
  }

  function tipoLabel(id) {
    const t = tipos.find((x) => x.id === id);
    return t ? t.nombre : id || "—";
  }

  function badgeClassForTipo(tipoId) {
    if (!tipoId) return "badge-cliente";
    const safe = String(tipoId).replace(/[^a-z0-9_-]/gi, "");
    return `badge-cliente badge-cliente-${safe}`;
  }

  function seedClientes() {
    return [
      { id: "c-coroso-1", tipo: "comunidad", nombre: "Coroso 1" },
      { id: "c-coroso-2", tipo: "comunidad", nombre: "Coroso 2" },
      { id: "c-coroso-3", tipo: "comunidad", nombre: "Coroso 3" },
      { id: "c-caramicheiros", tipo: "comunidad", nombre: "Caramicheiros" },
      { id: "c-comunidad-84", tipo: "comunidad", nombre: "Comunidad 84" },
      { id: "c-amarella-4", tipo: "comunidad", nombre: "Amarella 4" },
      { id: "c-do-campo", tipo: "comunidad", nombre: "Do Campo" },
      { id: "c-coral", tipo: "comunidad", nombre: "Coral" },
      { id: "c-monumento-14", tipo: "comunidad", nombre: "Monumento 14" },
      { id: "c-piso-negro", tipo: "piso", nombre: "Piso negro" },
      { id: "c-froiz", tipo: "oficina", nombre: "Froiz" },
      { id: "c-gestoria", tipo: "oficina", nombre: "Gestoría Rosalía de Castro 34" },
      { id: "c-faro", tipo: "oficina", nombre: "Restaurante Faro" },
      { id: "c-eco-cabanas", tipo: "casa", nombre: "Eco Cabañas" },
      { id: "c-campino", tipo: "casa", nombre: "O Campiño" },
      { id: "c-colexio", tipo: "oficina", nombre: "Colexio Aguiño" },
      { id: "c-pautada", tipo: "oficina", nombre: "A Pautada" },
    ];
  }

  function loadClientes() {
    try {
      const raw = localStorage.getItem(CLIENTES_KEY);
      if (!raw) {
        const seeded = seedClientes();
        localStorage.setItem(CLIENTES_KEY, JSON.stringify(seeded));
        return seeded;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        const seeded = seedClientes();
        localStorage.setItem(CLIENTES_KEY, JSON.stringify(seeded));
        return seeded;
      }
      return parsed
        .filter((c) => c && typeof c.nombre === "string" && c.nombre.trim())
        .map((c) => ({
          id: c.id || uid(),
          tipo: String(c.tipo || ""),
          nombre: String(c.nombre).trim(),
        }));
    } catch {
      return seedClientes();
    }
  }

  function emptyPlan(fecha) {
    return { fecha: fecha || todayYmdMadrid(), bloques: [] };
  }

  function loadPlan() {
    try {
      const raw = localStorage.getItem(PLAN_KEY);
      if (!raw) return emptyPlan();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return emptyPlan();
      return {
        fecha: parsed.fecha || todayYmdMadrid(),
        bloques: Array.isArray(parsed.bloques) ? parsed.bloques : [],
      };
    } catch {
      return emptyPlan();
    }
  }

  function savePlan(plan) {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  }

  function loadEvents() {
    try {
      const raw = localStorage.getItem(EVENTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveEvents(events) {
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  }

  // ——— Crew ———
  function getSelectedCrew() {
    return Array.from(crewToggles.querySelectorAll(".crew-btn[aria-pressed='true']"))
      .map((b) => b.getAttribute("data-name"))
      .filter((n) => CREW.includes(n));
  }

  function setCrewSelection(names) {
    const set = new Set(names || []);
    crewToggles.querySelectorAll(".crew-btn").forEach((btn) => {
      const on = set.has(btn.getAttribute("data-name"));
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.classList.toggle("selected", on);
    });
  }

  // ——— Draft stops ———
  function findCliente(id) {
    return clientes.find((c) => c.id === id);
  }

  function findClienteByName(name) {
    const k = normalizeText(name);
    return clientes.find((c) => normalizeText(c.nombre) === k);
  }

  function toggleDraftStop(clienteId) {
    const i = draftStopIds.indexOf(clienteId);
    if (i === -1) draftStopIds.push(clienteId);
    else draftStopIds.splice(i, 1);
    renderQuickChips();
    renderPickList();
    renderSelectedStops();
    updateEstimate();
  }

  function renderQuickChips() {
    const chips = QUICK_NAMES.map((name) => {
      const c = findClienteByName(name);
      if (!c) return "";
      const on = draftStopIds.includes(c.id);
      return (
        `<button type="button" class="chip-btn quick-chip${on ? " active" : ""}" data-id="${escapeHtml(c.id)}">` +
        `${escapeHtml(c.nombre)}</button>`
      );
    }).filter(Boolean);
    quickChips.innerHTML = chips.length
      ? chips.join("")
      : `<p class="hint-inline">No hay Coroso 1–3 en clientes. Búscalos abajo o añádelos en Clientes.</p>`;
  }

  function renderPickList() {
    const q = normalizeText(searchParadas.value);
    let list = clientes.slice();
    if (q) {
      list = list.filter((c) => normalizeText(c.nombre).includes(q));
    } else {
      // Prefer comunidades first when empty search
      list.sort((a, b) => {
        const ac = a.tipo === "comunidad" ? 0 : 1;
        const bc = b.tipo === "comunidad" ? 0 : 1;
        if (ac !== bc) return ac - bc;
        return a.nombre.localeCompare(b.nombre, "es");
      });
    }
    list = list.slice(0, 40);
    if (!list.length) {
      paradaPickList.innerHTML = `<p class="empty-msg">Sin resultados.</p>`;
      return;
    }
    paradaPickList.innerHTML = list
      .map((c) => {
        const on = draftStopIds.includes(c.id);
        return (
          `<button type="button" class="parada-pick${on ? " selected" : ""}" data-id="${escapeHtml(c.id)}" role="option" aria-selected="${on}">` +
          `<span class="${badgeClassForTipo(c.tipo)}">${escapeHtml(tipoLabel(c.tipo))}</span>` +
          `<span class="parada-pick-name">${escapeHtml(c.nombre)}</span>` +
          `<span class="parada-pick-mark" aria-hidden="true">${on ? "✓" : "+"}</span>` +
          `</button>`
        );
      })
      .join("");
  }

  function renderSelectedStops() {
    if (!draftStopIds.length) {
      selectedStops.innerHTML = `<p class="hint-inline">Ninguna parada seleccionada.</p>`;
      return;
    }
    selectedStops.innerHTML =
      `<ol class="selected-stops-list">` +
      draftStopIds
        .map((id, idx) => {
          const c = findCliente(id);
          if (!c) return "";
          return (
            `<li>` +
            `<span class="sel-ord">${idx + 1}.</span> ` +
            `<span class="${badgeClassForTipo(c.tipo)}">${escapeHtml(tipoLabel(c.tipo))}</span> ` +
            `<strong>${escapeHtml(c.nombre)}</strong>` +
            `<button type="button" class="btn-remove-stop" data-id="${escapeHtml(c.id)}" aria-label="Quitar ${escapeHtml(c.nombre)}">✕</button>` +
            `</li>`
          );
        })
        .join("") +
      `</ol>`;
  }

  function updateEstimate() {
    const crew = getSelectedCrew();
    const N = crew.length;
    const K = draftStopIds.length;
    const mins = estimateDurationMin(K, N);
    const start = inputHoraInicio.value || nowHmMadrid();
    let endHm = mins > 0 && N > 0 ? addMinutesHm(start, mins) : "—";
    if (checkOverrideEnd.checked && inputHoraFin.value) {
      endHm = inputHoraFin.value;
    } else if (!checkOverrideEnd.checked && mins > 0 && N > 0) {
      inputHoraFin.value = endHm !== "—" ? endHm : "";
    }

    estCrew.textContent = String(N);
    estStops.textContent = String(K);
    estDuration.textContent = N === 0 || K === 0 ? "—" : formatDuration(mins);
    estEnd.textContent = N === 0 || K === 0 ? "—" : endHm;
    crewHint.hidden = N > 0;
  }

  // ——— Save bloque ———
  function buildBloqueFromDraft() {
    const crew = getSelectedCrew();
    if (!crew.length) {
      crewHint.hidden = false;
      setupStatus.textContent = "Selecciona el equipo.";
      return null;
    }
    if (!draftStopIds.length) {
      setupStatus.textContent = "Añade al menos una parada.";
      return null;
    }
    const fecha = inputFecha.value || todayYmdMadrid();
    const horaInicio = inputHoraInicio.value || nowHmMadrid();
    const K = draftStopIds.length;
    const N = crew.length;
    const durationMin = estimateDurationMin(K, N);
    let horaFinEstimada = addMinutesHm(horaInicio, durationMin);
    let horaFinOverride = null;
    if (checkOverrideEnd.checked && inputHoraFin.value) {
      horaFinOverride = inputHoraFin.value;
    }

    const stops = draftStopIds.map((cid) => {
      const c = findCliente(cid);
      return {
        id: uid(),
        clienteId: cid,
        nombre: c ? c.nombre : "?",
        tipo: c ? c.tipo : "",
        done: false,
        eventId: null,
        doneAt: null,
        llegadaAt: null,
      };
    });

    return {
      id: editingBloqueId || uid(),
      horaInicio,
      horaFinEstimada,
      horaFinOverride,
      durationMin,
      equipo: crew,
      stops,
      createdAt: new Date().toISOString(),
      _fecha: fecha,
    };
  }

  function persistBloque(bloque, startDay) {
    const plan = loadPlan();
    plan.fecha = bloque._fecha || inputFecha.value || todayYmdMadrid();
    delete bloque._fecha;

    const idx = plan.bloques.findIndex((b) => b.id === bloque.id);
    if (idx >= 0) {
      // Preserve done state if re-saving same bloque ids... replace stops fresh on edit
      plan.bloques[idx] = bloque;
    } else {
      plan.bloques.push(bloque);
    }
    savePlan(plan);
    editingBloqueId = null;
    setupStatus.textContent = startDay
      ? "Jornada lista. ¡A registrar!"
      : "Bloque guardado.";
    showDayView();
  }

  function onGuardar(startDay) {
    const bloque = buildBloqueFromDraft();
    if (!bloque) return;
    persistBloque(bloque, startDay);
  }

  // ——— Views ———
  function showSetup(asNewBloque) {
    setupPanel.hidden = false;
    dayPanel.hidden = true;
    if (asNewBloque) {
      editingBloqueId = null;
      draftStopIds = [];
      setCrewSelection([]);
      checkOverrideEnd.checked = false;
      overrideEndRow.hidden = true;
      inputHoraInicio.value = nowHmMadrid();
      // Keep fecha from existing plan if any
      const plan = loadPlan();
      if (plan.bloques.length) inputFecha.value = plan.fecha || todayYmdMadrid();
    }
    renderQuickChips();
    renderPickList();
    renderSelectedStops();
    updateEstimate();
    setupStatus.textContent = asNewBloque && loadPlan().bloques.length
      ? "Nuevo bloque (se añade al día sin borrar lo anterior)."
      : "";
  }

  function showDayView() {
    const plan = loadPlan();
    if (!plan.bloques.length) {
      showSetup(false);
      return;
    }
    setupPanel.hidden = true;
    dayPanel.hidden = false;
    dayFecha.textContent = `(${plan.fecha})`;
    renderBloques(plan);
    dayStatus.textContent = "";
  }

  function renderBloques(plan) {
    bloquesList.innerHTML = plan.bloques
      .map((b, bi) => {
        const endShow = b.horaFinOverride || b.horaFinEstimada;
        const crewStr = (b.equipo || []).join(" · ") || "—";
        const doneCount = (b.stops || []).filter((s) => s.done).length;
        const total = (b.stops || []).length;
        const stopsHtml = (b.stops || [])
          .map((s) => {
            const doneCls = s.done ? " stop-done" : "";
            const badge = `<span class="${badgeClassForTipo(s.tipo)}">${escapeHtml(tipoLabel(s.tipo))}</span>`;
            let actual = "";
            if (s.done && s.doneAt) {
              const hm = new Intl.DateTimeFormat("es-ES", {
                timeZone: TZ,
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(new Date(s.doneAt));
              actual = `<span class="stop-actual">Hecho ${hm}</span>`;
            } else if (s.llegadaAt) {
              const hm = new Intl.DateTimeFormat("es-ES", {
                timeZone: TZ,
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(new Date(s.llegadaAt));
              actual = `<span class="stop-actual">Llegada ${hm}</span>`;
            }
            return (
              `<li class="stop-row${doneCls}" data-bloque="${escapeHtml(b.id)}" data-stop="${escapeHtml(s.id)}">` +
              `<div class="stop-info">` +
              `<strong class="stop-name">${escapeHtml(s.nombre)}</strong> ${badge}` +
              `<div class="stop-meta"><span class="stop-crew">${escapeHtml(crewStr)}</span> ${actual}</div>` +
              `</div>` +
              `<div class="stop-actions">` +
              (s.done
                ? `<span class="stop-check" aria-label="Hecho">✓</span>`
                : `<button type="button" class="btn-llegada" data-action="llegada">Llegada</button>` +
                  `<button type="button" class="btn-hecho" data-action="hecho">Hecho</button>` +
                  `<button type="button" class="btn-secondary btn-reg" data-action="registrar">Registrar…</button>`) +
              `</div>` +
              `</li>`
            );
          })
          .join("");

        return (
          `<article class="bloque-card" data-bloque-id="${escapeHtml(b.id)}">` +
          `<header class="bloque-head">` +
          `<h3>Bloque ${bi + 1}</h3>` +
          `<p class="bloque-times">${escapeHtml(b.horaInicio)} → ${escapeHtml(endShow)}` +
          ` · ${escapeHtml(formatDuration(b.durationMin))} · ${doneCount}/${total}</p>` +
          `<p class="bloque-crew">${escapeHtml(crewStr)}</p>` +
          `</header>` +
          `<ul class="stop-checklist">${stopsHtml}</ul>` +
          `</article>`
        );
      })
      .join("");
  }

  // ——— Quick log ———
  function requestGeoForReg() {
    regGeo = { lat: null, lng: null, accuracy_m: null, pending: true, error: null };
    regGpsStatus.textContent = "Obteniendo GPS…";
    regGpsStatus.className = "gps-status";
    if (!navigator.geolocation) {
      regGeo.pending = false;
      regGeo.error = "Geolocalización no disponible";
      regGpsStatus.textContent = "GPS no disponible. Puedes guardar sin GPS.";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        regGeo = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
          pending: false,
          error: null,
        };
        regGpsStatus.textContent = `GPS OK (±${regGeo.accuracy_m ?? "?"} m)`;
        regGpsStatus.className = "gps-status gps-ok";
      },
      (err) => {
        regGeo.pending = false;
        regGeo.error = err.message || "Error GPS";
        regGpsStatus.textContent = "GPS falló. Marca «Guardar sin GPS» o reintenta.";
        regGpsStatus.className = "gps-status gps-err";
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }

  function markLlegada(bloqueId, stopId) {
    const plan = loadPlan();
    const b = plan.bloques.find((x) => x.id === bloqueId);
    if (!b) return;
    const s = (b.stops || []).find((x) => x.id === stopId);
    if (!s || s.done) return;
    s.llegadaAt = new Date().toISOString();
    savePlan(plan);
    renderBloques(plan);
    dayStatus.textContent = `Llegada: ${s.nombre}`;
  }

  function createClosedEvent({ tipo, stop, equipo, fecha, horaInicio, horaFin }) {
    const sin = regSinGps.checked || (regGeo.lat == null && !regGeo.pending);
    if (!sin && regGeo.pending) {
      return { error: "Espera al GPS o marca «Guardar sin GPS»." };
    }
    if (!sin && (regGeo.lat == null || regGeo.lng == null)) {
      return { error: "Sin GPS. Marca «Guardar sin GPS»." };
    }

    const startParts = parseHm(horaInicio);
    const endParts = parseHm(horaFin);
    let iso = new Date().toISOString();
    // Prefer "now" for quick log; note plan times in notas
    const notes = [
      "Plan del día",
      horaInicio && horaFin ? `bloque ${horaInicio}–${horaFin}` : null,
      stop.llegadaAt ? "con llegada previa" : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const ev = {
      id: "e-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      iso,
      tipo: tipo || "Traslado personal",
      lat: sin ? null : regGeo.lat,
      lng: sin ? null : regGeo.lng,
      accuracy_m: sin ? null : regGeo.accuracy_m,
      comunidad_casa: stop.nombre || "",
      cliente_tipo: stop.tipo || "",
      notas: notes,
      sin_gps: !!sin,
      equipo: (equipo || []).join(" + "),
      importe_eur: null,
      estado: "cerrado",
    };

    // Optionally stamp iso closer to plan end if override wanted — keep now for "on site" accuracy
    void startParts;
    void endParts;
    void fecha;

    const events = loadEvents();
    events.push(ev);
    saveEvents(events);
    return { event: ev };
  }

  function markHecho(bloqueId, stopId, openSheet) {
    const plan = loadPlan();
    const b = plan.bloques.find((x) => x.id === bloqueId);
    if (!b) return;
    const s = (b.stops || []).find((x) => x.id === stopId);
    if (!s || s.done) return;

    if (openSheet) {
      pendingReg = { bloqueId, stopId, mode: "sheet" };
      regEventoTipo = "Traslado personal";
      regTipoToggles.querySelectorAll(".tipo-btn").forEach((btn) => {
        const on = btn.getAttribute("data-evento") === regEventoTipo;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
      regStopName.textContent = s.nombre;
      regSinGps.checked = false;
      regOverlay.hidden = false;
      requestGeoForReg();
      return;
    }

    // One-tap Hecho: get GPS briefly then save
    pendingReg = { bloqueId, stopId, mode: "one-tap" };
    regEventoTipo = "Traslado personal";
    regSinGps.checked = false;
    dayStatus.textContent = `Registrando ${s.nombre}…`;
    requestGeoForReg();
    // Wait a short moment for GPS, then save (or without)
    const trySave = (attempt) => {
      if (!pendingReg || pendingReg.mode !== "one-tap") return;
      if (regGeo.pending && attempt < 8) {
        setTimeout(() => trySave(attempt + 1), 400);
        return;
      }
      if (regGeo.lat == null && !regSinGps.checked) {
        // Auto allow sin GPS after timeout for speed
        regSinGps.checked = true;
      }
      finishRegister();
    };
    setTimeout(() => trySave(0), 300);
  }

  function finishRegister() {
    if (!pendingReg) return;
    const { bloqueId, stopId } = pendingReg;
    const plan = loadPlan();
    const b = plan.bloques.find((x) => x.id === bloqueId);
    if (!b) {
      pendingReg = null;
      regOverlay.hidden = true;
      return;
    }
    const s = (b.stops || []).find((x) => x.id === stopId);
    if (!s) {
      pendingReg = null;
      regOverlay.hidden = true;
      return;
    }

    const endShow = b.horaFinOverride || b.horaFinEstimada;
    const result = createClosedEvent({
      tipo: regEventoTipo,
      stop: s,
      equipo: b.equipo,
      fecha: plan.fecha,
      horaInicio: b.horaInicio,
      horaFin: endShow,
    });
    if (result.error) {
      if (pendingReg.mode === "sheet") {
        alert(result.error);
      } else {
        dayStatus.textContent = result.error;
      }
      return;
    }

    s.done = true;
    s.doneAt = result.event.iso;
    s.eventId = result.event.id;
    if (!s.llegadaAt) s.llegadaAt = result.event.iso;
    savePlan(plan);
    pendingReg = null;
    regOverlay.hidden = true;
    renderBloques(plan);
    const where = result.event.sin_gps
      ? "sin GPS"
      : `${Number(result.event.lat).toFixed(5)}, ${Number(result.event.lng).toFixed(5)}`;
    dayStatus.textContent = `✓ ${s.nombre} · ${result.event.tipo} · ${where}`;
  }

  function clearPlan() {
    if (!confirm("¿Borrar todo el plan del día? Los eventos ya registrados se mantienen.")) return;
    savePlan(emptyPlan(todayYmdMadrid()));
    draftStopIds = [];
    editingBloqueId = null;
    resetSetupDefaults();
    showSetup(false);
    setupStatus.textContent = "Plan borrado.";
  }

  function resetSetupDefaults() {
    inputFecha.value = todayYmdMadrid();
    inputHoraInicio.value = nowHmMadrid();
    inputHoraFin.value = "";
    checkOverrideEnd.checked = false;
    overrideEndRow.hidden = true;
    setCrewSelection([]);
    draftStopIds = [];
    searchParadas.value = "";
  }

  // ——— Events ———
  crewToggles.addEventListener("click", (e) => {
    const btn = e.target.closest(".crew-btn");
    if (!btn) return;
    const on = btn.getAttribute("aria-pressed") === "true";
    btn.setAttribute("aria-pressed", on ? "false" : "true");
    btn.classList.toggle("selected", !on);
    updateEstimate();
  });

  quickChips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-id]");
    if (!btn) return;
    toggleDraftStop(btn.getAttribute("data-id"));
  });

  paradaPickList.addEventListener("click", (e) => {
    const btn = e.target.closest(".parada-pick");
    if (!btn) return;
    toggleDraftStop(btn.getAttribute("data-id"));
  });

  selectedStops.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove-stop");
    if (!btn) return;
    toggleDraftStop(btn.getAttribute("data-id"));
  });

  searchParadas.addEventListener("input", () => renderPickList());

  inputHoraInicio.addEventListener("change", updateEstimate);
  inputHoraInicio.addEventListener("input", updateEstimate);
  inputFecha.addEventListener("change", updateEstimate);

  $("#btnInicioMinus").addEventListener("click", () => {
    inputHoraInicio.value = adjustHm(inputHoraInicio.value, -5);
    updateEstimate();
  });
  $("#btnInicioPlus").addEventListener("click", () => {
    inputHoraInicio.value = adjustHm(inputHoraInicio.value, 5);
    updateEstimate();
  });
  $("#btnAhora").addEventListener("click", () => {
    inputHoraInicio.value = nowHmMadrid();
    updateEstimate();
  });

  checkOverrideEnd.addEventListener("change", () => {
    overrideEndRow.hidden = !checkOverrideEnd.checked;
    if (checkOverrideEnd.checked && !inputHoraFin.value) {
      updateEstimate();
    }
    updateEstimate();
  });
  inputHoraFin.addEventListener("change", updateEstimate);
  inputHoraFin.addEventListener("input", updateEstimate);

  $("#btnGuardarPlan").addEventListener("click", () => onGuardar(false));
  $("#btnEmpezar").addEventListener("click", () => onGuardar(true));

  $("#btnNuevoBloque").addEventListener("click", () => showSetup(true));
  $("#btnEditarSetup").addEventListener("click", () => showSetup(true));
  $("#btnBorrarPlan").addEventListener("click", clearPlan);

  bloquesList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const row = btn.closest(".stop-row");
    if (!row) return;
    const bloqueId = row.getAttribute("data-bloque");
    const stopId = row.getAttribute("data-stop");
    const action = btn.getAttribute("data-action");
    if (action === "llegada") markLlegada(bloqueId, stopId);
    else if (action === "hecho") markHecho(bloqueId, stopId, false);
    else if (action === "registrar") markHecho(bloqueId, stopId, true);
  });

  regTipoToggles.addEventListener("click", (e) => {
    const btn = e.target.closest(".tipo-btn");
    if (!btn) return;
    regEventoTipo = btn.getAttribute("data-evento") || "Traslado personal";
    regTipoToggles.querySelectorAll(".tipo-btn").forEach((b) => {
      const on = b === btn;
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  });

  $("#btnCancelReg").addEventListener("click", () => {
    pendingReg = null;
    regOverlay.hidden = true;
  });
  $("#btnConfirmReg").addEventListener("click", finishRegister);
  regOverlay.addEventListener("click", (e) => {
    if (e.target === regOverlay) {
      pendingReg = null;
      regOverlay.hidden = true;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !regOverlay.hidden) {
      pendingReg = null;
      regOverlay.hidden = true;
    }
  });

  // ——— SW ———
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }

  // ——— Init ———
  tipos = loadTipos();
  clientes = loadClientes();
  // If clientes empty, app.js seed may not have run — soft seed Coroso names won't exist;
  // user can open index/clientes first. Still show search.
  resetSetupDefaults();
  const plan = loadPlan();
  if (plan.fecha) inputFecha.value = plan.fecha;
  if (plan.bloques.length) {
    showDayView();
  } else {
    showSetup(false);
  }
})();
