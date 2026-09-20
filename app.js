/**
 * Paradas GPS — registro geolocalizado de eventos de trabajo
 * Zona horaria: Europe/Madrid · Persistencia: localStorage
 */
(function () {
  "use strict";

  const STORAGE_KEY = "paradas-gps-v1";
  const SEEDED_FLAG = "paradas-gps-seeded-v1";
  const CLIENTES_KEY = "paradas-gps-clientes";
  const TIPOS_KEY = "paradas-gps-tipos-cliente";
  const TZ = "Europe/Madrid";

  const DEFAULT_TIPOS = [
    { id: "comunidad", nombre: "Comunidad" },
    { id: "piso", nombre: "Piso" },
    { id: "casa", nombre: "Casa" },
    { id: "oficina", nombre: "Oficina" },
  ];

  /** @typedef {{
   *   id: string,
   *   iso: string,
   *   tipo: string,
   *   lat: number|null,
   *   lng: number|null,
   *   accuracy_m: number|null,
   *   comunidad_casa: string,
   *   cliente_tipo?: string,
   *   notas: string,
   *   sin_gps: boolean,
   *   equipo?: string,
   *   importe_eur?: number|null,
   *   estado?: "cerrado"|"abierto"
   * }} Evento */

  /** @typedef {{ id: string, tipo: string, nombre: string }} Cliente */
  /** @typedef {{ id: string, nombre: string }} TipoCliente */

  // ——— DOM ———
  const $ = (sel) => document.querySelector(sel);
  const eventList = $("#eventList");
  const emptyMsg = $("#emptyMsg");
  const eventCount = $("#eventCount");
  const statusBar = $("#statusBar");
  const statusText = $("#statusText");
  const sheetOverlay = $("#sheetOverlay");
  const confirmOverlay = $("#confirmOverlay");
  const sheetTipo = $("#sheetTipo");
  const tipoToggles = $("#tipoToggles");
  const inputNombre = $("#inputNombre");
  const suggestList = $("#suggestList");
  const crewToggles = $("#crewToggles");
  const CREW = ["Haydee", "Adriana", "Virginia", "Joy", "Mikael"];
  const inputImporte = $("#inputImporte");
  const inputNotas = $("#inputNotas");
  const checkAbierto = $("#checkAbierto");
  const gpsStatus = $("#gpsStatus");
  const manualGps = $("#manualGps");
  const inputLat = $("#inputLat");
  const inputLng = $("#inputLng");
  const checkSinGps = $("#checkSinGps");
  const btnSaveSheet = $("#btnSaveSheet");
  const btnCancelSheet = $("#btnCancelSheet");
  const btnCancelDelete = $("#btnCancelDelete");
  const btnConfirmDelete = $("#btnConfirmDelete");
  const confirmText = $("#confirmText");

  /** @type {Evento[]} */
  let events = [];
  /** @type {"hoy"|"todos"} */
  let filterMode = "hoy";
  /** Sheet state */
  let sheetMode = "new"; // "new" | "edit"
  /** @type {string|null} */
  let editingId = null;
  /** @type {string} */
  let pendingTipo = "";
  /** @type {{lat:number|null,lng:number|null,accuracy_m:number|null,sin_gps:boolean,pending:boolean,error:string|null}} */
  let geoState = resetGeo();
  /** @type {string|null} */
  let deleteTargetId = null;
  /** @type {string} selected cliente tipo chip (tipo id) */
  let selectedClienteTipo = "";
  /** @type {Cliente[]} */
  let clientes = [];
  /** @type {TipoCliente[]} */
  let tipos = [];
  /** @type {number} */
  let suggestActiveIdx = -1;
  /** @type {number|null} */
  let suggestBlurTimer = null;

  function resetGeo() {
    return {
      lat: null,
      lng: null,
      accuracy_m: null,
      sin_gps: false,
      pending: false,
      error: null,
    };
  }

  // ——— Persistencia ———
  function loadEvents() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(normalizeEvent);
    } catch {
      return [];
    }
  }

  function normalizeEvent(ev) {
    return {
      ...ev,
      comunidad_casa: ev.comunidad_casa != null ? String(ev.comunidad_casa) : "",
      cliente_tipo: resolveTipoId(ev.cliente_tipo),
      equipo: ev.equipo != null ? String(ev.equipo) : "",
      importe_eur:
        ev.importe_eur === "" || ev.importe_eur == null
          ? null
          : Number(ev.importe_eur),
      estado: ev.estado === "abierto" ? "abierto" : "cerrado",
    };
  }

  function saveEvents() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }

  function uid() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 9)
    );
  }

  // ——— Tipos de cliente (localStorage) ———
  function seedTipos() {
    return DEFAULT_TIPOS.map((t) => ({ ...t }));
  }

  function normalizeTipo(t) {
    const id = String(t.id || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const nombre = String(t.nombre || "").trim();
    if (!id || !nombre) return null;
    return { id, nombre };
  }

  function loadTipos() {
    try {
      const raw = localStorage.getItem(TIPOS_KEY);
      if (!raw) {
        const seeded = seedTipos();
        localStorage.setItem(TIPOS_KEY, JSON.stringify(seeded));
        return seeded;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        const seeded = seedTipos();
        localStorage.setItem(TIPOS_KEY, JSON.stringify(seeded));
        return seeded;
      }
      const seen = new Set();
      const list = [];
      for (const rawT of parsed) {
        const t = normalizeTipo(rawT);
        if (!t || seen.has(t.id)) continue;
        seen.add(t.id);
        list.push(t);
      }
      if (!list.length) {
        const seeded = seedTipos();
        localStorage.setItem(TIPOS_KEY, JSON.stringify(seeded));
        return seeded;
      }
      return list;
    } catch {
      return seedTipos();
    }
  }

  function isKnownTipo(id) {
    return tipos.some((t) => t.id === id);
  }

  function tipoLabel(id) {
    if (!id) return "";
    const t = tipos.find((x) => x.id === id);
    return t ? t.nombre : id;
  }

  /** Resolve raw value (id or legacy display name) to a tipo id. */
  function resolveTipoId(raw) {
    const catalog = tipos.length ? tipos : DEFAULT_TIPOS;
    const s = String(raw || "").trim();
    if (!s) return "";
    const lower = s.toLowerCase();
    if (catalog.some((t) => t.id === lower)) return lower;
    if (catalog.some((t) => t.id === s)) return s;
    const n = normalizeText(s);
    const byNombre = catalog.find((t) => normalizeText(t.nombre) === n);
    if (byNombre) return byNombre.id;
    return lower.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "";
  }

  function badgeClassForTipo(tipoId) {
    if (!tipoId) return "badge-cliente";
    const safe = String(tipoId).replace(/[^a-z0-9_-]/gi, "");
    return `badge-cliente badge-cliente-${safe}`;
  }

  function renderTipoToggles() {
    if (!tipoToggles) return;
    const selected = selectedClienteTipo;
    tipoToggles.innerHTML = tipos
      .map(
        (t) =>
          `<button type="button" class="tipo-btn" data-tipo="${escapeHtml(t.id)}" aria-pressed="${
            selected === t.id ? "true" : "false"
          }">${escapeHtml(t.nombre)}</button>`
      )
      .join("");
  }

  // ——— Clientes (localStorage) ———
  function normalizeText(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
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
      const list = parsed
        .filter((c) => c && typeof c.nombre === "string" && c.nombre.trim())
        .map((c) => ({
          id: c.id || uid(),
          tipo: (() => {
            const id = resolveTipoId(c.tipo);
            return isKnownTipo(id) ? id : "";
          })(),
          nombre: String(c.nombre).trim(),
        }));
      // Merge any missing seed names (does not overwrite existing)
      const byKey = new Map(list.map((c) => [normalizeText(c.nombre), c]));
      let merged = false;
      for (const s of seedClientes()) {
        const k = normalizeText(s.nombre);
        if (!byKey.has(k)) {
          list.push(s);
          byKey.set(k, s);
          merged = true;
        }
      }
      if (merged) localStorage.setItem(CLIENTES_KEY, JSON.stringify(list));
      return list;
    } catch {
      return seedClientes();
    }
  }

  function saveClientes() {
    localStorage.setItem(CLIENTES_KEY, JSON.stringify(clientes));
  }

  /** Upsert by accent/case-insensitive nombre; updates tipo if provided. */
  function upsertCliente(nombre, tipo) {
    const name = String(nombre || "").trim();
    if (!name) return;
    const key = normalizeText(name);
    const tip = isKnownTipo(tipo) ? tipo : "";
    const idx = clientes.findIndex((c) => normalizeText(c.nombre) === key);
    if (idx === -1) {
      clientes.push({ id: uid(), tipo: tip, nombre: name });
      saveClientes();
      return;
    }
    const prev = clientes[idx];
    let changed = false;
    if (tip && prev.tipo !== tip) {
      prev.tipo = tip;
      changed = true;
    }
    // Keep nicer casing if user typed a different form of same name
    if (prev.nombre !== name) {
      prev.nombre = name;
      changed = true;
    }
    if (changed) saveClientes();
  }

  function filterClientes(query) {
    const q = normalizeText(query);
    if (!q) return [];
    return clientes
      .filter((c) => normalizeText(c.nombre).includes(q))
      .sort((a, b) => {
        const an = normalizeText(a.nombre);
        const bn = normalizeText(b.nombre);
        const aStarts = an.startsWith(q) ? 0 : 1;
        const bStarts = bn.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return an.localeCompare(bn, "es");
      })
      .slice(0, 8);
  }

  function setClienteTipo(tipo) {
    const id = resolveTipoId(tipo);
    selectedClienteTipo = isKnownTipo(id) ? id : "";
    tipoToggles.querySelectorAll(".tipo-btn").forEach((btn) => {
      const on = btn.dataset.tipo === selectedClienteTipo;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function clearClienteTipo() {
    setClienteTipo("");
  }

  function hideSuggestions() {
    suggestList.hidden = true;
    suggestList.innerHTML = "";
    suggestActiveIdx = -1;
    inputNombre.setAttribute("aria-expanded", "false");
  }

  function showSuggestions(matches) {
    if (!matches.length) {
      hideSuggestions();
      return;
    }
    suggestList.innerHTML = matches
      .map((c, i) => {
        const label = c.tipo ? tipoLabel(c.tipo) : "";
        const tipoHtml = label
          ? `<span class="suggest-tipo">${escapeHtml(label)}</span>`
          : "";
        return `<li role="option" id="suggest-opt-${i}">
          <button type="button" class="suggest-item" data-idx="${i}" data-id="${escapeHtml(c.id)}">
            <span class="suggest-nombre">${escapeHtml(c.nombre)}</span>
            ${tipoHtml}
          </button>
        </li>`;
      })
      .join("");
    suggestList.hidden = false;
    suggestActiveIdx = -1;
    inputNombre.setAttribute("aria-expanded", "true");
    suggestList._matches = matches;
  }

  function applySuggestion(cliente) {
    if (!cliente) return;
    inputNombre.value = cliente.nombre;
    if (cliente.tipo) setClienteTipo(cliente.tipo);
    hideSuggestions();
  }

  function refreshSuggestionsFromInput() {
    const q = inputNombre.value.trim();
    if (!q) {
      hideSuggestions();
      return;
    }
    showSuggestions(filterClientes(q));
  }

  // ——— Tiempo Europe/Madrid ———
  /** Build ISO from local Madrid wall-clock on a given calendar day (YYYY-MM-DD). */
  function madridIso(ymd, hh, mm, ss) {
    const [y, mo, d] = ymd.split("-").map(Number);
    const pad = (n) => String(n).padStart(2, "0");
    // Probe UTC offset for that Madrid local time via iterative format
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
    const corrected = new Date(guess.getTime() + (target - asUtc));
    return corrected.toISOString();
  }

  function formatLocalParts(iso) {
    const d = new Date(iso);
    const fecha = new Intl.DateTimeFormat("es-ES", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const hora = new Intl.DateTimeFormat("es-ES", {
      timeZone: TZ,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(d);
    return { fecha, hora };
  }

  function displayTime(iso) {
    const { fecha, hora } = formatLocalParts(iso);
    return `${fecha} · ${hora}`;
  }

  function isTodayMadrid(iso) {
    const d = new Date(iso);
    const today = new Date();
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(d) === fmt.format(today);
  }

  function mapsUrl(lat, lng) {
    if (lat == null || lng == null) return "";
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  // ——— Día de referencia (lunes 14 sep 2026) ———
  const REF_DAY = "2026-09-14";

  /**
   * Coords: Nominatim OSM where noted; others are Ribeira-area placeholders
   * with tiny distinct offsets so maps_url still works.
   */
  function buildReferenceDayEvents() {
    const D = REF_DAY;
    let n = 0;
    const mk = (partial) => {
      n += 1;
      return normalizeEvent({
        id: `ref-${D}-${String(n).padStart(2, "0")}`,
        accuracy_m: 12,
        sin_gps: false,
        equipo: "",
        importe_eur: null,
        estado: "cerrado",
        cliente_tipo: "",
        ...partial,
      });
    };

    return [
      // 1. Coroso — NOMINATIM neighbourhood
      mk({
        iso: madridIso(D, 8, 10),
        tipo: "Traslado personal",
        lat: 42.5685821,
        lng: -8.9855375,
        comunidad_casa: "Coroso 1, 2, 3",
        cliente_tipo: "comunidad",
        equipo: "3 personas",
        notas: "Ritmo 3 personas ~45 min. Fin estimado ~08:50–08:55.",
      }),
      // 2. Caramicheiros — PLACEHOLDER near Ribeira
      mk({
        iso: madridIso(D, 9, 0),
        tipo: "Traslado personal",
        lat: 42.5721,
        lng: -8.9912,
        comunidad_casa: "Caramicheiros",
        cliente_tipo: "comunidad",
        equipo: "3 personas",
        notas: "Fin ~09:35. Recogiste a Vicky. (coords aproximadas Ribeira)",
      }),
      // 3. Comunidad 84 — PLACEHOLDER
      mk({
        iso: madridIso(D, 9, 40),
        tipo: "Traslado personal",
        lat: 42.5558,
        lng: -8.9905,
        comunidad_casa: "Comunidad 84",
        cliente_tipo: "comunidad",
        equipo: "Vicky + Haydee",
        notas: "Hasta ~10:10. (coords aproximadas centro Ribeira)",
      }),
      // 4. Amarella 4 — NOMINATIM building
      mk({
        iso: madridIso(D, 9, 46),
        tipo: "Traslado personal",
        lat: 42.5536181,
        lng: -8.9920011,
        comunidad_casa: "Amarella 4",
        cliente_tipo: "comunidad",
        equipo: "Joy + Adriana",
        notas: "~09:46 → ~10:15.",
      }),
      // 5. Do Campo / Miguel Rodríguez Bautista 28 — NOMINATIM street
      mk({
        iso: madridIso(D, 10, 20),
        tipo: "Traslado personal",
        lat: 42.5568184,
        lng: -8.9945492,
        comunidad_casa: "Do Campo",
        cliente_tipo: "comunidad",
        equipo: "Vicky + Haydee",
        notas: "10:20 → 10:53.",
      }),
      // 10. Gestoría llaves (chronological insert) — Rosalía street NOMINATIM
      mk({
        iso: madridIso(D, 10, 44),
        tipo: "Tarea hecha",
        lat: 42.55455,
        lng: -8.9924,
        comunidad_casa: "Gestoría Rosalía de Castro 34",
        cliente_tipo: "oficina",
        notas: "Copias de llaves. (coords calle Rosalía, nº aproximado)",
      }),
      // 7. Froiz Rosalía 58 — dejadas 10:30 ABIERTO (Adriana sin recogida)
      mk({
        iso: madridIso(D, 10, 30),
        tipo: "Traslado personal",
        lat: 42.5553349,
        lng: -8.9911353,
        comunidad_casa: "Froiz",
        cliente_tipo: "oficina",
        equipo: "Joy + Adriana",
        estado: "abierto",
        notas:
          "Dejadas ~10:30. Adriana: sin pickup/fin registrado (dejar abierto).",
      }),
      // 6a. Coral — PLACEHOLDER
      mk({
        iso: madridIso(D, 11, 2),
        tipo: "Traslado personal",
        lat: 42.5542,
        lng: -8.9898,
        comunidad_casa: "Coral",
        cliente_tipo: "comunidad",
        equipo: "3 personas",
        notas: "11:02 → 11:20. (coords aproximadas Ribeira)",
      }),
      // 6b. Monumento 14 — NOMINATIM street
      mk({
        iso: madridIso(D, 11, 22),
        tipo: "Traslado personal",
        lat: 42.5529742,
        lng: -8.9926818,
        comunidad_casa: "Monumento 14",
        cliente_tipo: "comunidad",
        equipo: "3 personas",
        notas: "Tras Coral, a las 11:22.",
      }),
      // 11. Colexio Aguiño — NOMINATIM school ABIERTO
      mk({
        iso: madridIso(D, 11, 26),
        tipo: "Recogida",
        lat: 42.531213,
        lng: -9.0143078,
        comunidad_casa: "Colexio Aguiño",
        cliente_tipo: "oficina",
        estado: "abierto",
        notas: "Alfombras lavadas. Entrega no cerrada (dejar abierto).",
      }),
      // 12. Salida ropa limpia
      mk({
        iso: madridIso(D, 12, 0),
        tipo: "Entrega",
        lat: 42.555,
        lng: -8.993,
        comunidad_casa: "Salida ropa limpia → Eco Cabañas y O Campiño",
        notas: "Salida ~12:00 hacia Eco Cabañas y O Campiño. (coords base Ribeira)",
      }),
      // 13a. Eco Cabañas entrega — PLACEHOLDER near O Xobre
      mk({
        iso: madridIso(D, 12, 24),
        tipo: "Entrega",
        lat: 42.5905,
        lng: -8.9485,
        comunidad_casa: "Eco Cabañas",
        cliente_tipo: "casa",
        notas: "Entrega ropa limpia. (coords aproximadas zona O Xobre)",
      }),
      // 13b. Eco Cabañas recogida
      mk({
        iso: madridIso(D, 12, 25),
        tipo: "Recogida",
        lat: 42.59052,
        lng: -8.94848,
        comunidad_casa: "Eco Cabañas",
        cliente_tipo: "casa",
        notas: "Recogiste 3 bolsas negras. (coords aproximadas zona O Xobre)",
      }),
      // 14. O Campiño — NOMINATIM hamlet area
      mk({
        iso: madridIso(D, 12, 35),
        tipo: "Entrega",
        lat: 42.5928611,
        lng: -8.9467356,
        comunidad_casa: "O Campiño",
        cliente_tipo: "casa",
        importe_eur: 45.9,
        notas: "Sin ropa a recoger. Importe 45,90 €.",
      }),
      // 8. Joy Faro cristales — PLACEHOLDER (Av. Coruña 70 no OSM exact)
      mk({
        iso: madridIso(D, 13, 35),
        tipo: "Tarea hecha",
        lat: 42.5574,
        lng: -8.9958,
        comunidad_casa: "Restaurante Faro",
        cliente_tipo: "oficina",
        equipo: "Joy",
        notas: "Cristales. Plan 13:00, real ~13:35 (+35). (coords aproximadas Ribeira)",
      }),
      // 9. Piso negro Corrubedo — NOMINATIM parish
      mk({
        iso: madridIso(D, 14, 0),
        tipo: "Tarea hecha",
        lat: 42.5830713,
        lng: -9.0691824,
        comunidad_casa: "Piso negro",
        cliente_tipo: "piso",
        equipo: "Haydee + Vicky + tú",
        notas: "~14:00 → ~14:45. (coords parroquia Corrubedo)",
      }),
      // 15. A Pautada Xarás — NOMINATIM industrial
      mk({
        iso: madridIso(D, 16, 30),
        tipo: "Tarea hecha",
        lat: 42.5741936,
        lng: -8.9987657,
        comunidad_casa: "A Pautada",
        cliente_tipo: "oficina",
        notas: "Ventana 14:00–15:00; fin real 16:30.",
      }),
    ];
  }

  function loadReferenceDay(forceReplace) {
    const seed = buildReferenceDayEvents();
    if (events.length > 0 && !forceReplace) {
      const ok = confirm(
        `Hay ${events.length} evento(s) en el historial.\n¿Reemplazarlos por el día de referencia (lunes 14/09/2026, ${seed.length} eventos)?`
      );
      if (!ok) {
        setStatus("Carga de referencia cancelada.", null);
        return;
      }
    }
    events = seed;
    saveEvents();
    try {
      localStorage.setItem(SEEDED_FLAG, "1");
    } catch {
      /* ignore */
    }
    filterMode = "todos";
    $("#filterTodos").classList.add("active");
    $("#filterHoy").classList.remove("active");
    renderList();
    setStatus(
      `Día de referencia cargado: ${seed.length} eventos (14/09/2026).`,
      "ok"
    );
  }

  function clearHistory() {
    if (events.length === 0) {
      setStatus("El historial ya está vacío.", null);
      return;
    }
    const ok = confirm(
      `¿Vaciar el historial completo (${events.length} eventos)? Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    events = [];
    saveEvents();
    // Keep SEEDED_FLAG so auto-seed only runs once; use the load button to restore.
    renderList();
    setStatus("Historial vaciado.", "ok");
  }

  function maybeAutoSeed() {
    if (events.length > 0) return;
    let already;
    try {
      already = localStorage.getItem(SEEDED_FLAG);
    } catch {
      already = null;
    }
    if (already) return;
    events = buildReferenceDayEvents();
    saveEvents();
    try {
      localStorage.setItem(SEEDED_FLAG, "1");
    } catch {
      /* ignore */
    }
    filterMode = "todos";
    $("#filterTodos").classList.add("active");
    $("#filterHoy").classList.remove("active");
    setStatus(
      `Día de referencia (14/09/2026) cargado automáticamente (${events.length} eventos).`,
      "ok"
    );
  }

  // ——— Estado UI ———
  function setStatus(msg, kind) {
    statusText.textContent = msg;
    statusBar.classList.remove("ok", "err", "busy");
    if (kind) statusBar.classList.add(kind);
  }

  function filteredEvents() {
    const sorted = events.slice().sort((a, b) => (a.iso < b.iso ? 1 : -1));
    if (filterMode === "hoy") return sorted.filter((e) => isTodayMadrid(e.iso));
    return sorted;
  }

  function renderList() {
    const list = filteredEvents();
    eventCount.textContent = `(${list.length})`;
    eventList.innerHTML = "";

    if (list.length === 0) {
      emptyMsg.hidden = false;
      return;
    }
    emptyMsg.hidden = true;

    const frag = document.createDocumentFragment();
    for (const ev of list) {
      const li = document.createElement("li");
      li.className = "event-card";
      li.dataset.tipo = ev.tipo;
      li.dataset.id = ev.id;
      if (ev.estado === "abierto") li.classList.add("estado-abierto");

      const coordsHtml =
        ev.sin_gps || ev.lat == null
          ? `<div class="event-coords">Sin GPS</div>`
          : `<div class="event-coords">
              <a href="${mapsUrl(ev.lat, ev.lng)}" target="_blank" rel="noopener">
                ${Number(ev.lat).toFixed(5)}, ${Number(ev.lng).toFixed(5)}
              </a>
              ${
                ev.accuracy_m != null
                  ? ` · ±${Math.round(ev.accuracy_m)} m`
                  : ""
              }
            </div>`;

      const tipoBadge = ev.cliente_tipo
        ? `<span class="${badgeClassForTipo(ev.cliente_tipo)}">${escapeHtml(
            tipoLabel(ev.cliente_tipo)
          )}</span>`
        : "";
      const comunidad = ev.comunidad_casa || ev.cliente_tipo
        ? `<div class="event-meta"><strong>Lugar:</strong> ${tipoBadge}${
            ev.comunidad_casa ? escapeHtml(ev.comunidad_casa) : ""
          }</div>`
        : "";
      const equipo = crewButtonsHtmlForEvent(ev);
      const importe =
        ev.importe_eur != null && Number.isFinite(Number(ev.importe_eur))
          ? `<div class="event-meta"><strong>Importe:</strong> ${escapeHtml(
              Number(ev.importe_eur).toFixed(2)
            )} €</div>`
          : "";
      const estadoBadge =
        ev.estado === "abierto"
          ? `<span class="badge-abierto">Abierto</span>`
          : "";
      const notas = ev.notas
        ? `<div class="event-meta"><strong>Notas:</strong> ${escapeHtml(ev.notas)}</div>`
        : "";

      li.innerHTML = `
        <div class="event-top">
          <span class="event-tipo">${escapeHtml(ev.tipo)} ${estadoBadge}</span>
          <span class="event-time">${escapeHtml(displayTime(ev.iso))}</span>
        </div>
        ${comunidad}
        ${equipo}
        ${importe}
        ${notas}
        ${coordsHtml}
        <div class="event-actions">
          <button type="button" class="btn-sm btn-edit" data-id="${ev.id}">Editar</button>
          <button type="button" class="btn-sm danger btn-del" data-id="${ev.id}">Borrar</button>
        </div>
      `;
      frag.appendChild(li);
    }
    eventList.appendChild(frag);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ——— Geolocalización ———
  function requestGeo() {
    geoState = resetGeo();
    geoState.pending = true;
    updateGpsUi();

    if (!navigator.geolocation) {
      geoState.pending = false;
      geoState.error = "Este navegador no soporta geolocalización.";
      geoState.sin_gps = true;
      updateGpsUi();
      return;
    }

    const opts = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoState.pending = false;
        geoState.lat = pos.coords.latitude;
        geoState.lng = pos.coords.longitude;
        geoState.accuracy_m =
          typeof pos.coords.accuracy === "number"
            ? pos.coords.accuracy
            : null;
        geoState.error = null;
        geoState.sin_gps = false;
        updateGpsUi();
      },
      (err) => {
        geoState.pending = false;
        const messages = {
          1: "Permiso de ubicación denegado.",
          2: "Posición no disponible.",
          3: "Tiempo de espera agotado.",
        };
        geoState.error =
          messages[err.code] || err.message || "Error de GPS.";
        updateGpsUi();
      },
      opts
    );
  }

  function updateGpsUi() {
    manualGps.hidden = true;
    gpsStatus.classList.remove("ok", "err");

    if (geoState.pending) {
      gpsStatus.textContent = "Obteniendo GPS de alta precisión…";
      manualGps.hidden = false;
      return;
    }

    if (geoState.lat != null && geoState.lng != null && !geoState.sin_gps) {
      const acc =
        geoState.accuracy_m != null
          ? ` (±${Math.round(geoState.accuracy_m)} m)`
          : "";
      gpsStatus.textContent = `GPS OK: ${geoState.lat.toFixed(5)}, ${geoState.lng.toFixed(5)}${acc}`;
      gpsStatus.classList.add("ok");
      return;
    }

    gpsStatus.textContent = geoState.error
      ? `${geoState.error} Puedes guardar sin GPS o introducir coordenadas.`
      : "GPS no disponible.";
    gpsStatus.classList.add("err");
    manualGps.hidden = false;
  }


  // ——— Equipo (crew toggles) ———
  const CREW_ALIASES = {
    haydee: "Haydee",
    adriana: "Adriana",
    virginia: "Virginia",
    vicky: "Virginia",
    joy: "Joy",
    mikael: "Mikael",
    tu: "Mikael",
    yo: "Mikael",
  };

  function foldToken(raw) {
    return String(raw)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
  }

  /** Map free-text equipo tokens → canonical CREW names (aliases + ignore "N personas"). */
  function parseEquipoNames(equipoStr) {
    if (!equipoStr) return [];
    const parts = String(equipoStr)
      .split(/\s*[+,]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    const selected = new Set();
    for (const part of parts) {
      const folded = foldToken(part);
      if (!folded) continue;
      if (/^\d+\s*personas?$/.test(folded)) continue;
      const canonical = CREW_ALIASES[folded];
      if (canonical) selected.add(canonical);
    }
    return CREW.filter((name) => selected.has(name));
  }

  function getCrewButtons() {
    return Array.from(crewToggles.querySelectorAll(".crew-btn"));
  }

  function clearCrewSelection() {
    getCrewButtons().forEach((btn) => {
      btn.classList.remove("selected");
      btn.setAttribute("aria-pressed", "false");
    });
  }

  function setCrewSelectionFromEquipo(equipoStr) {
    clearCrewSelection();
    const selected = new Set(parseEquipoNames(equipoStr));
    getCrewButtons().forEach((btn) => {
      const name = btn.getAttribute("data-name");
      if (selected.has(name)) {
        btn.classList.add("selected");
        btn.setAttribute("aria-pressed", "true");
      }
    });
  }

  function getSelectedEquipo() {
    return getCrewButtons()
      .filter((btn) => btn.getAttribute("aria-pressed") === "true" || btn.classList.contains("selected"))
      .map((btn) => btn.getAttribute("data-name"))
      .filter((name) => CREW.includes(name))
      .join(" + ");
  }

  function toggleCrewBtn(btn) {
    const on = !(btn.getAttribute("aria-pressed") === "true");
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("selected", on);
  }

  function crewButtonsHtmlForEvent(ev) {
    const selected = new Set(parseEquipoNames(ev.equipo || ""));
    const buttons = CREW.map((name) => {
      const on = selected.has(name);
      return (
        `<button type="button" class="crew-btn${on ? " selected" : ""}"` +
        ` data-name="${escapeHtml(name)}" data-event-id="${escapeHtml(ev.id)}"` +
        ` aria-pressed="${on ? "true" : "false"}">${escapeHtml(name)}</button>`
      );
    }).join("");
    return (
      `<div class="event-equipo">` +
      `<div class="event-meta"><strong>Equipo</strong></div>` +
      `<div class="crew-toggles event-crew" role="group" aria-label="Equipo">${buttons}</div>` +
      `</div>`
    );
  }

  function toggleEventCrew(eventId, name) {
    if (!CREW.includes(name)) return;
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const current = new Set(parseEquipoNames(ev.equipo || ""));
    if (current.has(name)) current.delete(name);
    else current.add(name);
    ev.equipo = CREW.filter((n) => current.has(n)).join(" + ");
    saveEvents();
    renderList();
  }

  // ——— Sheet ———
  function openNewSheet(tipo) {
    tipos = loadTipos();
    renderTipoToggles();
    sheetMode = "new";
    editingId = null;
    pendingTipo = tipo;
    sheetTipo.textContent = tipo;
    clearClienteTipo();
    inputNombre.value = "";
    hideSuggestions();
    clearCrewSelection();
    inputImporte.value = "";
    inputNotas.value = "";
    checkAbierto.checked = false;
    inputLat.value = "";
    inputLng.value = "";
    checkSinGps.checked = false;
    inputLat.disabled = false;
    inputLng.disabled = false;
    sheetOverlay.hidden = false;
    setStatus(`Registrando: ${tipo}…`, "busy");
    requestGeo();
    setTimeout(() => inputNombre.focus(), 100);
  }

  function openEditSheet(id) {
    const ev = events.find((e) => e.id === id);
    if (!ev) return;
    tipos = loadTipos();
    renderTipoToggles();
    sheetMode = "edit";
    editingId = id;
    pendingTipo = ev.tipo;
    sheetTipo.textContent = ev.tipo;
    setClienteTipo(ev.cliente_tipo || "");
    inputNombre.value = ev.comunidad_casa || "";
    hideSuggestions();
    setCrewSelectionFromEquipo(ev.equipo || "");
    inputImporte.value =
      ev.importe_eur != null && Number.isFinite(Number(ev.importe_eur))
        ? String(ev.importe_eur)
        : "";
    inputNotas.value = ev.notas || "";
    checkAbierto.checked = ev.estado === "abierto";
    geoState = {
      lat: ev.lat,
      lng: ev.lng,
      accuracy_m: ev.accuracy_m,
      sin_gps: !!ev.sin_gps,
      pending: false,
      error: null,
    };
    if (ev.sin_gps || ev.lat == null) {
      checkSinGps.checked = true;
      inputLat.value = "";
      inputLng.value = "";
      inputLat.disabled = true;
      inputLng.disabled = true;
    } else {
      checkSinGps.checked = false;
      inputLat.value = String(ev.lat);
      inputLng.value = String(ev.lng);
      inputLat.disabled = false;
      inputLng.disabled = false;
    }
    updateGpsUi();
    manualGps.hidden = false;
    if (ev.lat != null && !ev.sin_gps) {
      inputLat.value = String(ev.lat);
      inputLng.value = String(ev.lng);
    }
    sheetOverlay.hidden = false;
    setTimeout(() => inputNombre.focus(), 100);
  }

  function closeSheet() {
    hideSuggestions();
    sheetOverlay.hidden = true;
    if (sheetMode === "new") {
      setStatus("Listo. Pulsa un botón para registrar.", null);
    }
  }

  function readExtraFields() {
    const equipo = getSelectedEquipo();
    const importeRaw = inputImporte.value.trim();
    let importe_eur = null;
    if (importeRaw !== "") {
      const n = Number(importeRaw);
      if (!Number.isFinite(n) || n < 0) {
        return { error: "Importe no válido." };
      }
      importe_eur = Math.round(n * 100) / 100;
    }
    const estado = checkAbierto.checked ? "abierto" : "cerrado";
    return { equipo, importe_eur, estado };
  }

  function readGeoFromForm() {
    if (checkSinGps.checked) {
      return { lat: null, lng: null, accuracy_m: null, sin_gps: true };
    }
    const latStr = inputLat.value.trim();
    const lngStr = inputLng.value.trim();
    if (latStr !== "" && lngStr !== "") {
      const lat = Number(latStr);
      const lng = Number(lngStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return { error: "Latitud o longitud no válidas." };
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return { error: "Coordenadas fuera de rango." };
      }
      return {
        lat,
        lng,
        accuracy_m: geoState.accuracy_m,
        sin_gps: false,
      };
    }
    if (geoState.lat != null && geoState.lng != null && !geoState.sin_gps) {
      return {
        lat: geoState.lat,
        lng: geoState.lng,
        accuracy_m: geoState.accuracy_m,
        sin_gps: false,
      };
    }
    if (!manualGps.hidden) {
      return {
        error:
          'Marca "Guardar sin GPS" o introduce latitud y longitud.',
      };
    }
    if (geoState.pending) {
      return { error: "Espera a obtener el GPS o guarda sin GPS." };
    }
    return {
      error:
        'No hay GPS. Marca "Guardar sin GPS" o introduce coordenadas.',
    };
  }

  function saveFromSheet() {
    const geo = readGeoFromForm();
    if (geo.error) {
      alert(geo.error);
      return;
    }

    const extra = readExtraFields();
    if (extra.error) {
      alert(extra.error);
      return;
    }

    const comunidad = inputNombre.value.trim();
    const cliente_tipo = selectedClienteTipo || "";
    const notas = inputNotas.value.trim();

    if (comunidad && cliente_tipo) {
      upsertCliente(comunidad, cliente_tipo);
    } else if (comunidad) {
      upsertCliente(comunidad, "");
    }

    if (sheetMode === "edit" && editingId) {
      const idx = events.findIndex((e) => e.id === editingId);
      if (idx === -1) return;
      events[idx] = {
        ...events[idx],
        comunidad_casa: comunidad,
        cliente_tipo,
        notas,
        equipo: extra.equipo,
        importe_eur: extra.importe_eur,
        estado: extra.estado,
        lat: geo.lat,
        lng: geo.lng,
        accuracy_m: geo.accuracy_m,
        sin_gps: geo.sin_gps,
      };
      saveEvents();
      closeSheet();
      renderList();
      setStatus("Evento actualizado.", "ok");
      return;
    }

    /** @type {Evento} */
    const ev = {
      id: uid(),
      iso: new Date().toISOString(),
      tipo: pendingTipo,
      lat: geo.lat,
      lng: geo.lng,
      accuracy_m: geo.accuracy_m,
      comunidad_casa: comunidad,
      cliente_tipo,
      notas,
      sin_gps: geo.sin_gps,
      equipo: extra.equipo,
      importe_eur: extra.importe_eur,
      estado: extra.estado,
    };
    events.push(ev);
    saveEvents();
    closeSheet();
    renderList();
    const where = geo.sin_gps
      ? "sin GPS"
      : `${geo.lat.toFixed(5)}, ${geo.lng.toFixed(5)}`;
    setStatus(`Guardado: ${ev.tipo} · ${where}`, "ok");
  }

  // ——— Borrar ———
  function askDelete(id) {
    const ev = events.find((e) => e.id === id);
    if (!ev) return;
    deleteTargetId = id;
    confirmText.textContent = `¿Borrar «${ev.tipo}» del ${displayTime(ev.iso)}?`;
    confirmOverlay.hidden = false;
  }

  function doDelete() {
    if (!deleteTargetId) return;
    events = events.filter((e) => e.id !== deleteTargetId);
    saveEvents();
    deleteTargetId = null;
    confirmOverlay.hidden = true;
    renderList();
    setStatus("Evento borrado.", "ok");
  }

  // ——— Export ———
  function csvEscape(val) {
    const s = val == null ? "" : String(val);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function exportCsv() {
    const headers = [
      "fecha",
      "hora",
      "tipo",
      "lat",
      "lng",
      "precision_m",
      "comunidad_casa",
      "cliente_tipo",
      "notas",
      "equipo",
      "importe_eur",
      "estado",
      "maps_url",
    ];
    const rows = events
      .slice()
      .sort((a, b) => (a.iso < b.iso ? -1 : 1))
      .map((ev) => {
        const { fecha, hora } = formatLocalParts(ev.iso);
        return [
          fecha,
          hora,
          ev.tipo,
          ev.lat != null ? ev.lat : "",
          ev.lng != null ? ev.lng : "",
          ev.accuracy_m != null ? Math.round(ev.accuracy_m) : "",
          ev.comunidad_casa || "",
          ev.cliente_tipo || "",
          ev.notas || "",
          ev.equipo || "",
          ev.importe_eur != null ? ev.importe_eur : "",
          ev.estado || "cerrado",
          mapsUrl(ev.lat, ev.lng),
        ]
          .map(csvEscape)
          .join(",");
      });

    const bom = "\uFEFF";
    const csv = bom + headers.join(",") + "\n" + rows.join("\n") + "\n";
    downloadBlob(
      csv,
      `paradas-gps-${dateStamp()}.csv`,
      "text/csv;charset=utf-8"
    );
    setStatus(`CSV exportado (${events.length} eventos).`, "ok");
  }

  function exportJson() {
    const payload = {
      app: "Paradas GPS",
      timezone: TZ,
      exported_at: new Date().toISOString(),
      count: events.length,
      events: events.slice().sort((a, b) => (a.iso < b.iso ? -1 : 1)),
    };
    const json = JSON.stringify(payload, null, 2);
    downloadBlob(
      json,
      `paradas-gps-${dateStamp()}.json`,
      "application/json;charset=utf-8"
    );
    setStatus(`JSON exportado (${events.length} eventos).`, "ok");
  }

  function dateStamp() {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(new Date())
      .replace(/-/g, "");
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ——— Eventos DOM ———
  document.querySelectorAll(".btn-event").forEach((btn) => {
    btn.addEventListener("click", () => {
      openNewSheet(btn.dataset.tipo);
    });
  });

  $("#filterHoy").addEventListener("click", () => {
    filterMode = "hoy";
    $("#filterHoy").classList.add("active");
    $("#filterTodos").classList.remove("active");
    renderList();
  });

  $("#filterTodos").addEventListener("click", () => {
    filterMode = "todos";
    $("#filterTodos").classList.add("active");
    $("#filterHoy").classList.remove("active");
    renderList();
  });

  $("#btnExportCsv").addEventListener("click", exportCsv);
  $("#btnExportJson").addEventListener("click", exportJson);
  $("#btnLoadSeed").addEventListener("click", () => loadReferenceDay(false));
  $("#btnClearHistory").addEventListener("click", clearHistory);

  crewToggles.addEventListener("click", (e) => {
    const btn = e.target.closest(".crew-btn");
    if (!btn || !crewToggles.contains(btn)) return;
    toggleCrewBtn(btn);
  });

  tipoToggles.addEventListener("click", (e) => {
    const btn = e.target.closest(".tipo-btn");
    if (!btn || !tipoToggles.contains(btn)) return;
    const tip = btn.dataset.tipo || "";
    if (selectedClienteTipo === tip) clearClienteTipo();
    else setClienteTipo(tip);
  });

  inputNombre.addEventListener("input", () => {
    refreshSuggestionsFromInput();
  });

  inputNombre.addEventListener("focus", () => {
    if (suggestBlurTimer) {
      clearTimeout(suggestBlurTimer);
      suggestBlurTimer = null;
    }
    refreshSuggestionsFromInput();
  });

  inputNombre.addEventListener("blur", () => {
    suggestBlurTimer = setTimeout(() => hideSuggestions(), 180);
  });

  inputNombre.addEventListener("keydown", (e) => {
    if (suggestList.hidden) return;
    const matches = suggestList._matches || [];
    if (!matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      suggestActiveIdx = Math.min(suggestActiveIdx + 1, matches.length - 1);
      highlightSuggest();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      suggestActiveIdx = Math.max(suggestActiveIdx - 1, 0);
      highlightSuggest();
    } else if (e.key === "Enter" && suggestActiveIdx >= 0) {
      e.preventDefault();
      applySuggestion(matches[suggestActiveIdx]);
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  });

  function highlightSuggest() {
    suggestList.querySelectorAll(".suggest-item").forEach((el, i) => {
      el.classList.toggle("active", i === suggestActiveIdx);
    });
  }

  suggestList.addEventListener("mousedown", (e) => {
    // keep focus; prevent blur-before-click
    e.preventDefault();
  });

  suggestList.addEventListener("click", (e) => {
    const item = e.target.closest(".suggest-item");
    if (!item || !suggestList.contains(item)) return;
    const matches = suggestList._matches || [];
    const idx = Number(item.dataset.idx);
    if (Number.isFinite(idx) && matches[idx]) applySuggestion(matches[idx]);
  });

  btnSaveSheet.addEventListener("click", saveFromSheet);
  btnCancelSheet.addEventListener("click", closeSheet);

  sheetOverlay.addEventListener("click", (e) => {
    if (e.target === sheetOverlay) closeSheet();
  });

  checkSinGps.addEventListener("change", () => {
    if (checkSinGps.checked) {
      inputLat.value = "";
      inputLng.value = "";
      inputLat.disabled = true;
      inputLng.disabled = true;
    } else {
      inputLat.disabled = false;
      inputLng.disabled = false;
    }
  });

  eventList.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const crewBtn = t.closest(".crew-btn");
    if (crewBtn && eventList.contains(crewBtn)) {
      const eventId = crewBtn.getAttribute("data-event-id");
      const name = crewBtn.getAttribute("data-name");
      if (eventId && name) toggleEventCrew(eventId, name);
      return;
    }
    if (t.classList.contains("btn-edit")) {
      openEditSheet(t.dataset.id);
    } else if (t.classList.contains("btn-del")) {
      askDelete(t.dataset.id);
    }
  });

  btnCancelDelete.addEventListener("click", () => {
    deleteTargetId = null;
    confirmOverlay.hidden = true;
  });
  btnConfirmDelete.addEventListener("click", doDelete);
  confirmOverlay.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) {
      deleteTargetId = null;
      confirmOverlay.hidden = true;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!confirmOverlay.hidden) {
        deleteTargetId = null;
        confirmOverlay.hidden = true;
      } else if (!sheetOverlay.hidden) {
        if (!suggestList.hidden) {
          hideSuggestions();
        } else {
          closeSheet();
        }
      }
    }
  });

  // ——— Service Worker ———
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.warn("SW no registrado:", err);
      });
    });
  }

  // Init
  tipos = loadTipos();
  events = loadEvents();
  clientes = loadClientes();
  renderTipoToggles();
  maybeAutoSeed();
  renderList();
  if (events.length === 0) {
    setStatus("Listo. Pulsa un botón para registrar.", null);
  }
})();
