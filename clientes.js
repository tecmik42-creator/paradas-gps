/**
 * Paradas GPS — gestión de clientes y tipos de lugar
 * Claves: paradas-gps-clientes, paradas-gps-tipos-cliente
 */
(function () {
  "use strict";

  const CLIENTES_KEY = "paradas-gps-clientes";
  const TIPOS_KEY = "paradas-gps-tipos-cliente";

  const DEFAULT_TIPOS = [
    { id: "comunidad", nombre: "Comunidad" },
    { id: "piso", nombre: "Piso" },
    { id: "casa", nombre: "Casa" },
    { id: "oficina", nombre: "Oficina" },
  ];

  const $ = (sel) => document.querySelector(sel);

  const tabClientes = $("#tabClientes");
  const tabTipos = $("#tabTipos");
  const panelClientes = $("#panelClientes");
  const panelTipos = $("#panelTipos");

  const searchInput = $("#searchClientes");
  const filterChips = $("#filterChips");
  const addTipoToggles = $("#addTipoToggles");
  const addNombre = $("#addNombre");
  const addHint = $("#addHint");
  const btnAddSave = $("#btnAddSave");
  const statusBar = $("#statusBar");
  const statusText = $("#statusText");
  const listCount = $("#listCount");
  const clientesList = $("#clientesList");
  const emptyMsg = $("#emptyMsg");
  const editOverlay = $("#editOverlay");
  const editTipoToggles = $("#editTipoToggles");
  const editNombre = $("#editNombre");
  const btnCancelEdit = $("#btnCancelEdit");
  const btnSaveEdit = $("#btnSaveEdit");
  const confirmOverlay = $("#confirmOverlay");
  const confirmText = $("#confirmText");
  const btnCancelDelete = $("#btnCancelDelete");
  const btnConfirmDelete = $("#btnConfirmDelete");
  const btnExportClientes = $("#btnExportClientes");
  const btnImportClientes = $("#btnImportClientes");
  const importFile = $("#importFile");

  const addTipoNombre = $("#addTipoNombre");
  const addTipoHint = $("#addTipoHint");
  const btnAddTipo = $("#btnAddTipo");
  const tiposStatusBar = $("#tiposStatusBar");
  const tiposStatusText = $("#tiposStatusText");
  const tiposListCount = $("#tiposListCount");
  const tiposList = $("#tiposList");
  const tiposEmptyMsg = $("#tiposEmptyMsg");
  const renameTipoOverlay = $("#renameTipoOverlay");
  const renameTipoNombre = $("#renameTipoNombre");
  const renameTipoHint = $("#renameTipoHint");
  const btnCancelRenameTipo = $("#btnCancelRenameTipo");
  const btnSaveRenameTipo = $("#btnSaveRenameTipo");
  const deleteTipoOverlay = $("#deleteTipoOverlay");
  const deleteTipoText = $("#deleteTipoText");
  const reassignWrap = $("#reassignWrap");
  const reassignTipoSelect = $("#reassignTipoSelect");
  const btnCancelDeleteTipo = $("#btnCancelDeleteTipo");
  const btnConfirmDeleteTipo = $("#btnConfirmDeleteTipo");

  /** @type {{ id: string, nombre: string }[]} */
  let tipos = [];
  /** @type {{ id: string, tipo: string, nombre: string }[]} */
  let clientes = [];
  /** @type {string} */
  let filterTipo = "todos";
  /** @type {string} */
  let addTipo = "";
  /** @type {string|null} */
  let editingId = null;
  /** @type {string} */
  let editTipo = "";
  /** @type {string|null} */
  let deleteTargetId = null;
  /** @type {string|null} */
  let renamingTipoId = null;
  /** @type {string|null} */
  let deletingTipoId = null;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function normalizeText(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function slugifyTipo(nombre) {
    let base =
      normalizeText(nombre)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "tipo";
    let id = base;
    let n = 2;
    while (tipos.some((t) => t.id === id)) {
      id = `${base}-${n++}`;
    }
    return id;
  }

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

  function saveTipos() {
    localStorage.setItem(TIPOS_KEY, JSON.stringify(tipos));
  }

  function tipoLabel(id) {
    if (!id) return "";
    const t = tipos.find((x) => x.id === id);
    if (t) return t.nombre;
    return id;
  }

  function isKnownTipo(id) {
    return tipos.some((t) => t.id === id);
  }

  /** Resolve raw value (id or legacy display name) to a tipo id. */
  function resolveTipoId(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const lower = s.toLowerCase();
    if (tipos.some((t) => t.id === lower)) return lower;
    if (tipos.some((t) => t.id === s)) return s;
    const n = normalizeText(s);
    const byNombre = tipos.find((t) => normalizeText(t.nombre) === n);
    if (byNombre) return byNombre.id;
    // Keep orphan slug so it still groups until reassigned
    return lower.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "";
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

  function normalizeCliente(c) {
    return {
      id: c.id || uid(),
      tipo: resolveTipoId(c.tipo),
      nombre: String(c.nombre || "").trim(),
    };
  }

  function loadClientes() {
    try {
      const raw = localStorage.getItem(CLIENTES_KEY);
      if (!raw) {
        const seeded = seedClientes();
        localStorage.setItem(CLIENTES_KEY, JSON.stringify(seeded));
        return seeded.slice();
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        const seeded = seedClientes();
        localStorage.setItem(CLIENTES_KEY, JSON.stringify(seeded));
        return seeded.slice();
      }
      return parsed
        .filter((c) => c && typeof c.nombre === "string" && c.nombre.trim())
        .map(normalizeCliente);
    } catch {
      return seedClientes();
    }
  }

  function saveClientes() {
    localStorage.setItem(CLIENTES_KEY, JSON.stringify(clientes));
  }

  function setStatus(msg, kind) {
    statusText.textContent = msg;
    statusBar.classList.remove("ok", "err", "busy");
    if (kind) statusBar.classList.add(kind);
  }

  function setTiposStatus(msg, kind) {
    tiposStatusText.textContent = msg;
    tiposStatusBar.classList.remove("ok", "err", "busy");
    if (kind) tiposStatusBar.classList.add(kind);
  }

  function setTipoPressed(container, tipo) {
    container.querySelectorAll(".tipo-btn").forEach((btn) => {
      const on = btn.dataset.tipo === tipo;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function renderTipoToggleButtons(container, selected) {
    container.innerHTML = tipos
      .map(
        (t) =>
          `<button type="button" class="tipo-btn" data-tipo="${escapeHtml(t.id)}" aria-pressed="${
            selected === t.id ? "true" : "false"
          }">${escapeHtml(t.nombre)}</button>`
      )
      .join("");
  }

  function tipoOrder() {
    return tipos.map((t) => t.id).concat([""]);
  }

  function countsByTipo() {
    const counts = { todos: clientes.length };
    for (const t of tipos) counts[t.id] = 0;
    for (const c of clientes) {
      if (counts[c.tipo] != null) counts[c.tipo] += 1;
      else if (c.tipo) {
        // orphan tipo still counted under its key for chip if present
        counts[c.tipo] = (counts[c.tipo] || 0) + 1;
      }
    }
    return counts;
  }

  function renderFilterChips() {
    const counts = countsByTipo();
    const active = filterTipo;
    const parts = [
      `<button type="button" class="chip-btn${
        active === "todos" ? " active" : ""
      }" data-filter="todos" aria-pressed="${active === "todos" ? "true" : "false"}">
        Todos <span class="chip-count" data-count-for="todos">${counts.todos}</span>
      </button>`,
    ];
    for (const t of tipos) {
      const on = active === t.id;
      parts.push(
        `<button type="button" class="chip-btn${on ? " active" : ""}" data-filter="${escapeHtml(
          t.id
        )}" aria-pressed="${on ? "true" : "false"}">
          ${escapeHtml(t.nombre)} <span class="chip-count" data-count-for="${escapeHtml(t.id)}">${
          counts[t.id] != null ? counts[t.id] : 0
        }</span>
        </button>`
      );
    }
    filterChips.innerHTML = parts.join("");
  }

  function updateChipCounts() {
    const counts = countsByTipo();
    filterChips.querySelectorAll("[data-count-for]").forEach((el) => {
      const key = el.getAttribute("data-count-for");
      el.textContent = String(counts[key] != null ? counts[key] : 0);
    });
  }

  function badgeClassForTipo(tipoId) {
    if (!tipoId) return "badge-cliente";
    const safe = String(tipoId).replace(/[^a-z0-9_-]/gi, "");
    return `badge-cliente badge-cliente-${safe}`;
  }

  function filteredClientes() {
    const q = normalizeText(searchInput.value);
    const order = tipoOrder();
    return clientes
      .filter((c) => {
        if (filterTipo !== "todos" && c.tipo !== filterTipo) return false;
        if (q && !normalizeText(c.nombre).includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = order.indexOf(a.tipo);
        const tb = order.indexOf(b.tipo);
        const ia = ta === -1 ? order.length : ta;
        const ib = tb === -1 ? order.length : tb;
        if (ia !== ib) return ia - ib;
        return normalizeText(a.nombre).localeCompare(normalizeText(b.nombre), "es");
      });
  }

  function groupByTipo(list) {
    /** @type {Record<string, typeof list>} */
    const groups = {};
    for (const c of list) {
      const key = c.tipo || "_sin";
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    const order =
      filterTipo === "todos"
        ? tipoOrder().concat(["_sin"]).filter((k, i, arr) => arr.indexOf(k) === i)
        : [filterTipo];
    // Include orphan keys not in order
    const extra = Object.keys(groups).filter((k) => !order.includes(k) && k !== "_sin");
    const fullOrder = order.concat(extra);
    return fullOrder
      .filter((k) => groups[k] && groups[k].length)
      .map((k) => ({
        tipo: k === "_sin" ? "" : k,
        label: k === "_sin" ? "Sin tipo" : tipoLabel(k) || k,
        items: groups[k],
      }));
  }

  function renderList() {
    updateChipCounts();
    const list = filteredClientes();
    listCount.textContent = `(${list.length})`;

    if (!list.length) {
      clientesList.innerHTML = "";
      emptyMsg.hidden = false;
      if (clientes.length === 0) {
        emptyMsg.textContent = "No hay clientes. Añade el primero arriba.";
      } else if (normalizeText(searchInput.value) || filterTipo !== "todos") {
        emptyMsg.textContent = "Ningún cliente coincide con la búsqueda o el filtro.";
      } else {
        emptyMsg.textContent = "No hay clientes. Añade el primero arriba.";
      }
      return;
    }

    emptyMsg.hidden = true;
    const groups = groupByTipo(list);
    clientesList.innerHTML = groups
      .map((g) => {
        const badgeClass = badgeClassForTipo(g.tipo);
        const items = g.items
          .map((c) => {
            return `
              <li class="cliente-card" data-id="${escapeHtml(c.id)}">
                <div class="cliente-card-main">
                  <span class="${badgeClass}">${escapeHtml(tipoLabel(c.tipo) || "—")}</span>
                  <span class="cliente-nombre">${escapeHtml(c.nombre)}</span>
                </div>
                <div class="cliente-card-actions">
                  <button type="button" class="btn-card-edit" data-action="edit" data-id="${escapeHtml(c.id)}">Editar</button>
                  <button type="button" class="btn-card-delete" data-action="delete" data-id="${escapeHtml(c.id)}">Borrar</button>
                </div>
              </li>`;
          })
          .join("");
        return `
          <section class="cliente-group" aria-label="${escapeHtml(g.label)}">
            <h3 class="cliente-group-title">
              ${escapeHtml(g.label)}
              <span class="count">(${g.items.length})</span>
            </h3>
            <ul class="cliente-group-list">${items}</ul>
          </section>`;
      })
      .join("");
  }

  function refreshTipoUI() {
    if (filterTipo !== "todos" && !isKnownTipo(filterTipo)) {
      filterTipo = "todos";
    }
    if (addTipo && !isKnownTipo(addTipo)) addTipo = "";
    if (editTipo && !isKnownTipo(editTipo)) editTipo = "";
    renderFilterChips();
    renderTipoToggleButtons(addTipoToggles, addTipo);
    renderTipoToggleButtons(editTipoToggles, editTipo);
    renderList();
    renderTiposList();
  }

  /**
   * Upsert by normalized nombre + tipo id.
   * @returns {"created"|"updated"|"noop"|null}
   */
  function upsertByNombreTipo(nombre, tipo, preferId) {
    const name = String(nombre || "").trim();
    if (!name) return null;
    const tip = isKnownTipo(tipo) ? tipo : "";
    const key = normalizeText(name);

    const same = clientes.find(
      (c) =>
        normalizeText(c.nombre) === key &&
        c.tipo === tip &&
        (!preferId || c.id !== preferId)
    );

    if (preferId) {
      const idx = clientes.findIndex((c) => c.id === preferId);
      if (idx === -1) return null;
      if (same) {
        same.nombre = name;
        same.tipo = tip;
        clientes.splice(idx, 1);
        saveClientes();
        return "updated";
      }
      const prev = clientes[idx];
      if (prev.nombre === name && prev.tipo === tip) return "noop";
      prev.nombre = name;
      prev.tipo = tip;
      saveClientes();
      return "updated";
    }

    if (same) {
      if (same.nombre !== name) {
        same.nombre = name;
        saveClientes();
        return "updated";
      }
      return "noop";
    }

    clientes.push({ id: uid(), tipo: tip, nombre: name });
    saveClientes();
    return "created";
  }

  function openEdit(id) {
    const c = clientes.find((x) => x.id === id);
    if (!c) return;
    editingId = id;
    editTipo = isKnownTipo(c.tipo) ? c.tipo : "";
    renderTipoToggleButtons(editTipoToggles, editTipo);
    editNombre.value = c.nombre;
    editOverlay.hidden = false;
    editNombre.focus();
  }

  function closeEdit() {
    editingId = null;
    editOverlay.hidden = true;
  }

  function openDelete(id) {
    const c = clientes.find((x) => x.id === id);
    if (!c) return;
    deleteTargetId = id;
    const label = c.tipo ? `${tipoLabel(c.tipo) || c.tipo}: ${c.nombre}` : c.nombre;
    confirmText.textContent = `Se borrará «${label}». Esta acción no se puede deshacer.`;
    confirmOverlay.hidden = false;
  }

  function closeDelete() {
    deleteTargetId = null;
    confirmOverlay.hidden = true;
  }

  function doDelete() {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    clientes = clientes.filter((c) => c.id !== id);
    saveClientes();
    closeDelete();
    renderList();
    setStatus("Cliente borrado.", "ok");
  }

  function onAddSave() {
    const name = addNombre.value.trim();
    if (!name) {
      addHint.hidden = false;
      addHint.textContent = "Escribe un nombre.";
      addHint.classList.add("hint-err");
      addNombre.focus();
      return;
    }
    if (!addTipo) {
      addHint.hidden = false;
      const names = tipos.map((t) => t.nombre).join(", ");
      addHint.textContent = names
        ? `Elige un tipo (${names}).`
        : "No hay tipos. Ve a la pestaña Tipos y crea uno.";
      addHint.classList.add("hint-err");
      return;
    }
    addHint.hidden = true;
    addHint.classList.remove("hint-err");
    const result = upsertByNombreTipo(name, addTipo, null);
    addNombre.value = "";
    renderList();
    if (result === "created") {
      setStatus(`Cliente «${name}» guardado.`, "ok");
    } else if (result === "updated" || result === "noop") {
      setStatus(`Ya existía «${name}» (${tipoLabel(addTipo)}); actualizado.`, "ok");
    }
  }

  function onSaveEdit() {
    if (!editingId) return;
    const name = editNombre.value.trim();
    if (!name) {
      setStatus("El nombre no puede estar vacío.", "err");
      editNombre.focus();
      return;
    }
    if (!editTipo) {
      setStatus("Elige un tipo de lugar.", "err");
      return;
    }
    const result = upsertByNombreTipo(name, editTipo, editingId);
    closeEdit();
    renderList();
    if (result === "updated" || result === "noop") {
      setStatus("Cliente actualizado.", "ok");
    } else {
      setStatus("Cliente guardado.", "ok");
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(clientes, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = `paradas-gps-clientes-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("Clientes exportados (JSON).", "ok");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        if (!Array.isArray(parsed)) {
          setStatus("El JSON debe ser una lista de clientes.", "err");
          return;
        }
        let added = 0;
        let updated = 0;
        for (const raw of parsed) {
          if (!raw || typeof raw.nombre !== "string" || !raw.nombre.trim()) continue;
          const tipo = resolveTipoId(raw.tipo);
          const tip = isKnownTipo(tipo) ? tipo : "";
          const r = upsertByNombreTipo(raw.nombre, tip, null);
          if (r === "created") added += 1;
          else if (r === "updated") updated += 1;
        }
        renderList();
        setStatus(`Importación: ${added} nuevos, ${updated} actualizados.`, "ok");
      } catch {
        setStatus("No se pudo leer el JSON.", "err");
      }
    };
    reader.onerror = () => setStatus("Error al leer el archivo.", "err");
    reader.readAsText(file, "utf-8");
  }

  // ——— Tipos CRUD ———

  function clientsUsingTipo(tipoId) {
    return clientes.filter((c) => c.tipo === tipoId);
  }

  function renderTiposList() {
    tiposListCount.textContent = `(${tipos.length})`;
    if (!tipos.length) {
      tiposList.innerHTML = "";
      tiposEmptyMsg.hidden = false;
      return;
    }
    tiposEmptyMsg.hidden = true;
    tiposList.innerHTML = tipos
      .map((t) => {
        const n = clientsUsingTipo(t.id).length;
        return `
          <li class="tipo-card" data-id="${escapeHtml(t.id)}">
            <div class="tipo-card-main">
              <span class="${badgeClassForTipo(t.id)}">${escapeHtml(t.nombre)}</span>
              <span class="tipo-meta">${n} cliente${n === 1 ? "" : "s"} · <code>${escapeHtml(
          t.id
        )}</code></span>
            </div>
            <div class="tipo-card-actions">
              <button type="button" class="btn-card-edit" data-action="rename-tipo" data-id="${escapeHtml(
                t.id
              )}">Renombrar</button>
              <button type="button" class="btn-card-delete" data-action="delete-tipo" data-id="${escapeHtml(
                t.id
              )}">Borrar</button>
            </div>
          </li>`;
      })
      .join("");
  }

  function onAddTipo() {
    const name = addTipoNombre.value.trim();
    if (!name) {
      addTipoHint.hidden = false;
      addTipoHint.textContent = "Escribe un nombre para el tipo.";
      addTipoHint.classList.add("hint-err");
      addTipoNombre.focus();
      return;
    }
    const dup = tipos.find((t) => normalizeText(t.nombre) === normalizeText(name));
    if (dup) {
      addTipoHint.hidden = false;
      addTipoHint.textContent = `Ya existe el tipo «${dup.nombre}».`;
      addTipoHint.classList.add("hint-err");
      return;
    }
    addTipoHint.hidden = true;
    addTipoHint.classList.remove("hint-err");
    const id = slugifyTipo(name);
    tipos.push({ id, nombre: name });
    saveTipos();
    addTipoNombre.value = "";
    refreshTipoUI();
    setTiposStatus(`Tipo «${name}» añadido.`, "ok");
  }

  function openRenameTipo(id) {
    const t = tipos.find((x) => x.id === id);
    if (!t) return;
    renamingTipoId = id;
    renameTipoNombre.value = t.nombre;
    renameTipoHint.hidden = true;
    renameTipoHint.classList.remove("hint-err");
    renameTipoOverlay.hidden = false;
    renameTipoNombre.focus();
    renameTipoNombre.select();
  }

  function closeRenameTipo() {
    renamingTipoId = null;
    renameTipoOverlay.hidden = true;
  }

  function saveRenameTipo() {
    if (!renamingTipoId) return;
    const t = tipos.find((x) => x.id === renamingTipoId);
    if (!t) {
      closeRenameTipo();
      return;
    }
    const name = renameTipoNombre.value.trim();
    if (!name) {
      renameTipoHint.hidden = false;
      renameTipoHint.textContent = "El nombre no puede estar vacío.";
      renameTipoHint.classList.add("hint-err");
      renameTipoNombre.focus();
      return;
    }
    const dup = tipos.find(
      (x) => x.id !== t.id && normalizeText(x.nombre) === normalizeText(name)
    );
    if (dup) {
      renameTipoHint.hidden = false;
      renameTipoHint.textContent = `Ya existe el tipo «${dup.nombre}».`;
      renameTipoHint.classList.add("hint-err");
      return;
    }
    const oldNombre = t.nombre;
    t.nombre = name;
    saveTipos();
    // Clients store tipo id; rename only changes display name.
    // Also migrate any client that still held the old display name as tipo.
    let migrated = 0;
    for (const c of clientes) {
      if (normalizeText(c.tipo) === normalizeText(oldNombre) && c.tipo !== t.id) {
        c.tipo = t.id;
        migrated += 1;
      }
    }
    if (migrated) saveClientes();
    closeRenameTipo();
    refreshTipoUI();
    setTiposStatus(
      migrated
        ? `Tipo renombrado a «${name}» (${migrated} cliente${migrated === 1 ? "" : "s"} actualizado${
            migrated === 1 ? "" : "s"
          }).`
        : `Tipo renombrado a «${name}».`,
      "ok"
    );
  }

  function openDeleteTipo(id) {
    const t = tipos.find((x) => x.id === id);
    if (!t) return;
    deletingTipoId = id;
    const users = clientsUsingTipo(id);
    const others = tipos.filter((x) => x.id !== id);

    if (users.length && !others.length) {
      deleteTipoText.textContent = `Hay ${users.length} cliente${
        users.length === 1 ? "" : "s"
      } con el tipo «${t.nombre}» y no hay otro tipo al que reasignarlos. Crea otro tipo o reasigna los clientes antes de borrar.`;
      reassignWrap.hidden = true;
      btnConfirmDeleteTipo.disabled = true;
      btnConfirmDeleteTipo.textContent = "No se puede borrar";
    } else if (users.length) {
      deleteTipoText.textContent = `Hay ${users.length} cliente${
        users.length === 1 ? "" : "s"
      } con el tipo «${t.nombre}». Elige a qué tipo reasignarlos, o cancela.`;
      reassignWrap.hidden = false;
      reassignTipoSelect.innerHTML = others
        .map(
          (o) =>
            `<option value="${escapeHtml(o.id)}">${escapeHtml(o.nombre)}</option>`
        )
        .join("");
      btnConfirmDeleteTipo.disabled = false;
      btnConfirmDeleteTipo.textContent = "Reasignar y borrar";
    } else {
      deleteTipoText.textContent = `Se borrará el tipo «${t.nombre}». Ningún cliente lo usa.`;
      reassignWrap.hidden = true;
      btnConfirmDeleteTipo.disabled = false;
      btnConfirmDeleteTipo.textContent = "Borrar";
    }
    deleteTipoOverlay.hidden = false;
  }

  function closeDeleteTipo() {
    deletingTipoId = null;
    deleteTipoOverlay.hidden = true;
    btnConfirmDeleteTipo.disabled = false;
    btnConfirmDeleteTipo.textContent = "Borrar";
  }

  function doDeleteTipo() {
    if (!deletingTipoId) return;
    const t = tipos.find((x) => x.id === deletingTipoId);
    if (!t) {
      closeDeleteTipo();
      return;
    }
    const users = clientsUsingTipo(t.id);
    const others = tipos.filter((x) => x.id !== t.id);

    if (users.length && !others.length) {
      setTiposStatus("No se puede borrar: no hay tipo de destino.", "err");
      return;
    }

    if (users.length) {
      const dest = reassignTipoSelect.value;
      if (!others.some((o) => o.id === dest)) {
        setTiposStatus("Elige un tipo de destino.", "err");
        return;
      }
      for (const c of users) c.tipo = dest;
      saveClientes();
    }

    tipos = tipos.filter((x) => x.id !== t.id);
    saveTipos();
    const name = t.nombre;
    closeDeleteTipo();
    refreshTipoUI();
    setTiposStatus(
      users.length
        ? `Tipo «${name}» borrado; ${users.length} cliente${
            users.length === 1 ? "" : "s"
          } reasignado${users.length === 1 ? "" : "s"}.`
        : `Tipo «${name}» borrado.`,
      "ok"
    );
  }

  function showView(view) {
    const isClientes = view === "clientes";
    panelClientes.hidden = !isClientes;
    panelTipos.hidden = isClientes;
    tabClientes.classList.toggle("active", isClientes);
    tabTipos.classList.toggle("active", !isClientes);
    tabClientes.setAttribute("aria-selected", isClientes ? "true" : "false");
    tabTipos.setAttribute("aria-selected", isClientes ? "false" : "true");
  }

  // ——— Events ———
  tabClientes.addEventListener("click", () => showView("clientes"));
  tabTipos.addEventListener("click", () => showView("tipos"));

  filterChips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip-btn");
    if (!btn) return;
    filterTipo = btn.dataset.filter || "todos";
    filterChips.querySelectorAll(".chip-btn").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    renderList();
  });

  searchInput.addEventListener("input", () => renderList());

  addTipoToggles.addEventListener("click", (e) => {
    const btn = e.target.closest(".tipo-btn");
    if (!btn) return;
    const tip = btn.dataset.tipo || "";
    addTipo = addTipo === tip ? "" : tip;
    setTipoPressed(addTipoToggles, addTipo);
  });

  btnAddSave.addEventListener("click", onAddSave);
  addNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onAddSave();
    }
  });

  clientesList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (!id) return;
    if (btn.dataset.action === "edit") openEdit(id);
    if (btn.dataset.action === "delete") openDelete(id);
  });

  editTipoToggles.addEventListener("click", (e) => {
    const btn = e.target.closest(".tipo-btn");
    if (!btn) return;
    const tip = btn.dataset.tipo || "";
    editTipo = editTipo === tip ? "" : tip;
    setTipoPressed(editTipoToggles, editTipo);
  });

  btnCancelEdit.addEventListener("click", closeEdit);
  btnSaveEdit.addEventListener("click", onSaveEdit);
  editOverlay.addEventListener("click", (e) => {
    if (e.target === editOverlay) closeEdit();
  });
  editNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSaveEdit();
    }
  });

  btnCancelDelete.addEventListener("click", closeDelete);
  btnConfirmDelete.addEventListener("click", doDelete);
  confirmOverlay.addEventListener("click", (e) => {
    if (e.target === confirmOverlay) closeDelete();
  });

  btnAddTipo.addEventListener("click", onAddTipo);
  addTipoNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onAddTipo();
    }
  });

  tiposList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (!id) return;
    if (btn.dataset.action === "rename-tipo") openRenameTipo(id);
    if (btn.dataset.action === "delete-tipo") openDeleteTipo(id);
  });

  btnCancelRenameTipo.addEventListener("click", closeRenameTipo);
  btnSaveRenameTipo.addEventListener("click", saveRenameTipo);
  renameTipoOverlay.addEventListener("click", (e) => {
    if (e.target === renameTipoOverlay) closeRenameTipo();
  });
  renameTipoNombre.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveRenameTipo();
    }
  });

  btnCancelDeleteTipo.addEventListener("click", closeDeleteTipo);
  btnConfirmDeleteTipo.addEventListener("click", doDeleteTipo);
  deleteTipoOverlay.addEventListener("click", (e) => {
    if (e.target === deleteTipoOverlay) closeDeleteTipo();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!deleteTipoOverlay.hidden) closeDeleteTipo();
    else if (!renameTipoOverlay.hidden) closeRenameTipo();
    else if (!confirmOverlay.hidden) closeDelete();
    else if (!editOverlay.hidden) closeEdit();
  });

  btnExportClientes.addEventListener("click", exportJson);
  btnImportClientes.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", () => {
    const file = importFile.files && importFile.files[0];
    importFile.value = "";
    if (file) importJson(file);
  });

  // ——— Init ———
  tipos = loadTipos();
  clientes = loadClientes();
  refreshTipoUI();
  setStatus(
    `${clientes.length} cliente${clientes.length === 1 ? "" : "s"} · ${tipos.length} tipo${
      tipos.length === 1 ? "" : "s"
    }.`,
    "ok"
  );
  setTiposStatus(`${tipos.length} tipo${tipos.length === 1 ? "" : "s"} en este dispositivo.`, "ok");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
