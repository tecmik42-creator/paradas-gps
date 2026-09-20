/**
 * Paradas GPS — gestión de clientes (paradas-gps-clientes)
 * Misma clave localStorage que el autocompletado del registro.
 */
(function () {
  "use strict";

  const CLIENTES_KEY = "paradas-gps-clientes";
  const CLIENTE_TIPOS = ["comunidad", "piso", "casa", "oficina"];
  const CLIENTE_TIPO_LABELS = {
    comunidad: "Comunidad",
    piso: "Piso",
    casa: "Casa",
    oficina: "Oficina",
  };
  const TIPO_ORDER = ["comunidad", "piso", "casa", "oficina", ""];

  const $ = (sel) => document.querySelector(sel);

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

  /** @type {{ id: string, tipo: string, nombre: string }[]} */
  let clientes = [];
  /** @type {"todos"|"comunidad"|"piso"|"casa"|"oficina"} */
  let filterTipo = "todos";
  /** @type {string} */
  let addTipo = "";
  /** @type {string|null} */
  let editingId = null;
  /** @type {string} */
  let editTipo = "";
  /** @type {string|null} */
  let deleteTargetId = null;

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
    const tip = String(c.tipo || "").toLowerCase();
    return {
      id: c.id || uid(),
      tipo: CLIENTE_TIPOS.includes(tip) ? tip : "",
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

  function setTipoPressed(container, tipo) {
    container.querySelectorAll(".tipo-btn").forEach((btn) => {
      const on = btn.dataset.tipo === tipo;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function countsByTipo() {
    const counts = { todos: clientes.length, comunidad: 0, piso: 0, casa: 0, oficina: 0 };
    for (const c of clientes) {
      if (counts[c.tipo] != null) counts[c.tipo] += 1;
    }
    return counts;
  }

  function updateChipCounts() {
    const counts = countsByTipo();
    filterChips.querySelectorAll("[data-count-for]").forEach((el) => {
      const key = el.getAttribute("data-count-for");
      el.textContent = String(counts[key] != null ? counts[key] : 0);
    });
  }

  function filteredClientes() {
    const q = normalizeText(searchInput.value);
    return clientes
      .filter((c) => {
        if (filterTipo !== "todos" && c.tipo !== filterTipo) return false;
        if (q && !normalizeText(c.nombre).includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const ta = TIPO_ORDER.indexOf(a.tipo);
        const tb = TIPO_ORDER.indexOf(b.tipo);
        if (ta !== tb) return ta - tb;
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
    const order = filterTipo === "todos" ? TIPO_ORDER.concat(["_sin"]) : [filterTipo];
    return order
      .filter((k) => groups[k] && groups[k].length)
      .map((k) => ({
        tipo: k === "_sin" ? "" : k,
        label: k === "_sin" ? "Sin tipo" : CLIENTE_TIPO_LABELS[k] || k,
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
        const badgeClass = g.tipo ? `badge-cliente badge-cliente-${g.tipo}` : "badge-cliente";
        const items = g.items
          .map((c) => {
            return `
              <li class="cliente-card" data-id="${escapeHtml(c.id)}">
                <div class="cliente-card-main">
                  <span class="${badgeClass}">${escapeHtml(CLIENTE_TIPO_LABELS[c.tipo] || "—")}</span>
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

  /**
   * Upsert by normalized nombre + tipo.
   * @returns {"created"|"updated"|"noop"|null}
   */
  function upsertByNombreTipo(nombre, tipo, preferId) {
    const name = String(nombre || "").trim();
    if (!name) return null;
    const tip = CLIENTE_TIPOS.includes(tipo) ? tipo : "";
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
        // Merge into existing duplicate key: update that one, drop the edited id
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
    editTipo = c.tipo || "";
    setTipoPressed(editTipoToggles, editTipo);
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
    const label = c.tipo
      ? `${CLIENTE_TIPO_LABELS[c.tipo] || c.tipo}: ${c.nombre}`
      : c.nombre;
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
      addHint.textContent = "Elige un tipo (Comunidad, Piso, Casa u Oficina).";
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
      setStatus(`Ya existía «${name}» (${CLIENTE_TIPO_LABELS[addTipo]}); actualizado.`, "ok");
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
          const tip = String(raw.tipo || "").toLowerCase();
          const tipo = CLIENTE_TIPOS.includes(tip) ? tip : "";
          const r = upsertByNombreTipo(raw.nombre, tipo, null);
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

  // ——— Events ———
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

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!confirmOverlay.hidden) closeDelete();
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
  clientes = loadClientes();
  renderList();
  setStatus(`${clientes.length} cliente${clientes.length === 1 ? "" : "s"} en este dispositivo.`, "ok");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
