/* ======================= CONFIGURACIÓN DE LA BODA ======================= */
const WEDDING_CONFIG = Object.freeze({
  brides: ["Gloria", "Jessica"],
  date: "2026-12-19T19:00:00-06:00",
  venue: "Quinta Buenaventura",
  mapsUrl: "https://maps.app.goo.gl/AAP9WkP97H6DwkRz6",
  googleScriptUrl: "https://script.google.com/macros/s/AKfycbxSY-EgzxiYVFsK0Sh8FIC3Oga7PJqOiaAA13k0mMAiC0N6f4DSG9wbDCZfUoZZmcQbgg/exec",
  musicVideoId: "tlGsEeS4PTc",
  developmentMode: true
});

const WEDDING_DATE = WEDDING_CONFIG.date;
const MAPS_URL = WEDDING_CONFIG.mapsUrl;
const GOOGLE_SCRIPT_URL = WEDDING_CONFIG.googleScriptUrl;
const DEVELOPMENT_MODE = WEDDING_CONFIG.developmentMode;
const GOOGLE_SCRIPT_PLACEHOLDER = "PEGAR_AQUI_URL_APPS_SCRIPT";
const MAX_MESSAGE_LENGTH = 300;
const REQUEST_TIMEOUT_MS = 10000;
const DEVELOPMENT_INVITATION = Object.freeze({ codigo: "TEST", invitado: "Invitado de prueba", lugares: 4 });

(() => {
  "use strict";

  const state = { invitation: null, attendance: null, people: 1, isTest: false };
  const elements = {
    form: document.querySelector("#rsvp-form"), invitationState: document.querySelector("#invitation-state"),
    responseFields: document.querySelector("#response-fields"),
    attendanceButtons: [...document.querySelectorAll("[data-attendance]")], attendanceError: document.querySelector("#attendance-error"),
    peopleField: document.querySelector("#people-field"), peopleCount: document.querySelector("#people-count"), seatsHint: document.querySelector("#seats-hint"),
    decrease: document.querySelector("#decrease-people"), increase: document.querySelector("#increase-people"),
    message: document.querySelector("#message"), messageCount: document.querySelector("#message-count"), submit: document.querySelector("#submit-button"),
    submitError: document.querySelector("#submit-error"), successState: document.querySelector("#success-state"),
    successTitle: document.querySelector("#success-title"), successMessage: document.querySelector("#success-message"), successDetail: document.querySelector("#success-detail"),
    savedState: document.querySelector("#saved-state"), savedAttendance: document.querySelector("#saved-attendance"), savedPeople: document.querySelector("#saved-people"),
    savedPeopleRow: document.querySelector("#saved-people-row"), modify: document.querySelector("#modify-response")
  };

  function normalizeCode(value) { return value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24); }
  function pluralizedSeats(seats) { return seats === 1 ? "Tenemos reservado 1 lugar para ti." : `Tenemos reservados ${seats} lugares para ustedes.`; }
  function storageKey() { return `boda-rsvp-${state.invitation?.codigo || "prueba"}`; }
  function clearElement(element) { while (element.firstChild) element.removeChild(element.firstChild); }

  function renderInvitation(invitation) {
    clearElement(elements.invitationState);
    const card = document.createElement("div"); card.className = "invitation-card";
    const overline = document.createElement("p"); overline.className = "overline"; overline.textContent = "Invitación para";
    const title = document.createElement("h3"); title.textContent = invitation.nombre;
    const seats = document.createElement("p"); seats.textContent = pluralizedSeats(invitation.lugares);
    if (state.isTest) {
      const badge = document.createElement("p"); badge.className = "test-badge"; badge.textContent = "Modo de prueba";
      card.append(badge);
    }
    card.append(overline, title, seats); elements.invitationState.append(card);
  }

  function renderAccessMessage(titleText, bodyText) {
    clearElement(elements.invitationState);
    const card = document.createElement("div"); card.className = "access-message";
    const title = document.createElement("h3"); title.textContent = titleText;
    const body = document.createElement("p"); body.textContent = bodyText;
    card.append(title, body); elements.invitationState.append(card);
  }

  function renderLoadingState() {
    clearElement(elements.invitationState);
    elements.form.hidden = true; elements.savedState.hidden = true; elements.successState.hidden = true;
    const card = document.createElement("div"); card.className = "access-message";
    const loader = document.createElement("div"); loader.className = "invitation-loader";
    const title = document.createElement("h3"); title.textContent = "Estamos preparando tu invitación…";
    card.append(loader, title); elements.invitationState.append(card);
  }

  function renderConnectionError(code) {
    clearElement(elements.invitationState); elements.form.hidden = true;
    const card = document.createElement("div"); card.className = "access-message";
    const title = document.createElement("h3"); title.textContent = "No pudimos cargar tu invitación en este momento.";
    const body = document.createElement("p"); body.textContent = "Por favor intenta nuevamente.";
    const retry = document.createElement("button"); retry.type = "button"; retry.className = "button button-secondary"; retry.textContent = "Intentar de nuevo";
    retry.addEventListener("click", () => loadRemoteInvitation(code));
    card.append(title, body, retry); elements.invitationState.append(card);
  }

  async function requestInvitation(code) {
    if (!GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === GOOGLE_SCRIPT_PLACEHOLDER) throw new Error("Google Apps Script no configurado");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `${GOOGLE_SCRIPT_URL}?accion=invitado&codigo=${encodeURIComponent(code)}`;
      const response = await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { window.clearTimeout(timeoutId); }
  }

  async function loadRemoteInvitation(code) {
    renderLoadingState();
    try {
      const result = await requestInvitation(code);
      if (result?.ok === false && result.error === "INVITACION_NO_ENCONTRADA") {
        renderAccessMessage("No pudimos encontrar esta invitación.", "Por favor verifica el enlace o código QR de tu invitación.");
        return;
      }
      const seats = Number(result?.lugares);
      if (result?.ok !== true || normalizeCode(String(result.codigo || "")) !== code || typeof result.invitado !== "string" || !result.invitado.trim() || !Number.isInteger(seats) || seats < 1) throw new Error("Respuesta de invitación inválida");
      activateInvitation({ codigo: code, nombre: result.invitado, lugares: seats });
    } catch (error) {
      console.error("No se pudo consultar la invitación:", error);
      renderConnectionError(code);
    }
  }

  async function initializeInvitation() {
    const rawCode = new URLSearchParams(window.location.search).get("codigo");
    if (rawCode) {
      const code = normalizeCode(rawCode);
      if (code) await loadRemoteInvitation(code);
      else renderAccessMessage("No pudimos encontrar esta invitación.", "Por favor verifica el enlace o código QR de tu invitación.");
      return;
    }
    if (!DEVELOPMENT_MODE) {
      renderAccessMessage("Necesitas acceder desde el código QR de tu invitación.", "Utiliza el enlace incluido en tu invitación para confirmar.");
      return;
    }
    activateInvitation({ codigo: DEVELOPMENT_INVITATION.codigo, nombre: DEVELOPMENT_INVITATION.invitado, lugares: DEVELOPMENT_INVITATION.lugares }, true);
  }

  function activateInvitation(invitation, isTest = false) {
    state.invitation = { codigo: invitation.codigo, nombre: invitation.nombre.trim(), lugares: Number(invitation.lugares) };
    state.isTest = isTest; state.people = 1;
    renderInvitation(state.invitation); elements.form.hidden = false;
    const saved = readSavedResponse();
    if (saved) showSavedResponse(saved); else showForm();
  }

  function showForm() {
    elements.savedState.hidden = true; elements.successState.hidden = true; elements.form.hidden = false; elements.responseFields.hidden = false;
    elements.seatsHint.textContent = state.invitation.lugares === 1 ? "Tienes 1 lugar reservado." : `Tienes ${state.invitation.lugares} lugares reservados.`;
    updatePeople();
  }

  function selectAttendance(value) {
    state.attendance = value; elements.attendanceError.textContent = "";
    elements.attendanceButtons.forEach(button => { const selected = button.dataset.attendance === value; button.classList.toggle("selected", selected); button.setAttribute("aria-pressed", String(selected)); });
    elements.peopleField.hidden = value !== "si";
    if (value === "no") { state.people = 0; } else if (state.people < 1) { state.people = 1; }
    updatePeople();
  }

  function updatePeople() {
    const max = state.invitation?.lugares || 1;
    if (state.attendance === "si") state.people = Math.min(max, Math.max(1, state.people));
    elements.peopleCount.value = state.people; elements.peopleCount.textContent = state.people;
    elements.decrease.disabled = state.people <= 1; elements.increase.disabled = state.people >= max;
  }

  function validateForm() {
    let valid = true; elements.attendanceError.textContent = ""; elements.submitError.textContent = "";
    if (!state.invitation || !Number.isInteger(state.invitation.lugares) || state.invitation.lugares < 1) { elements.submitError.textContent = "Esta invitación no está lista para confirmar."; valid = false; }
    if (!state.attendance) { elements.attendanceError.textContent = "Selecciona una opción para continuar."; valid = false; }
    if (state.attendance === "si" && (!Number.isInteger(state.people) || state.people < 1 || state.people > state.invitation.lugares)) { document.querySelector("#people-error").textContent = "Elige un número dentro de tus lugares reservados."; valid = false; } else document.querySelector("#people-error").textContent = "";
    if (elements.message.value.length > MAX_MESSAGE_LENGTH) { document.querySelector("#message-error").textContent = "El mensaje no puede superar 300 caracteres."; valid = false; } else document.querySelector("#message-error").textContent = "";
    return valid;
  }

  function createPayload() {
    return {
      codigo: state.invitation.codigo,
      asistencia: state.attendance === "si" ? "Sí" : "No", numeroPersonas: state.attendance === "si" ? state.people : 0,
      mensaje: elements.message.value.trim(),
      urlInvitacion: window.location.href
    };
  }

  async function sendResponse(payload) {
    if (state.isTest || !GOOGLE_SCRIPT_URL || GOOGLE_SCRIPT_URL === GOOGLE_SCRIPT_PLACEHOLDER) {
      console.info("MODO PRUEBA: respuesta RSVP no enviada a Google Sheets.", payload);
      await new Promise(resolve => window.setTimeout(resolve, 650)); return;
    }
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload), signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result?.ok !== true) throw new Error("El servidor rechazó la confirmación");
    } finally { window.clearTimeout(timeoutId); }
  }

  async function handleSubmit(event) {
    event.preventDefault(); if (!validateForm()) return;
    elements.submit.disabled = true; elements.submit.textContent = "Confirmando…";
    const payload = createPayload();
    try { await sendResponse(payload); saveResponse(payload); showSuccess(payload); }
    catch (error) { console.error("No se pudo guardar la confirmación:", error); elements.submitError.textContent = "No pudimos guardar tu respuesta. Revisa tu conexión e inténtalo de nuevo."; }
    finally { elements.submit.disabled = false; elements.submit.textContent = "Confirmar asistencia"; }
  }

  function saveResponse(payload) {
    try { localStorage.setItem(storageKey(), JSON.stringify({ codigo: payload.codigo, asistencia: payload.asistencia, numeroPersonas: payload.numeroPersonas, fecha: new Date().toISOString() })); }
    catch (error) { console.warn("No fue posible guardar la respuesta localmente.", error); }
  }
  function readSavedResponse() {
    try { const value = localStorage.getItem(storageKey()); if (!value) return null; const parsed = JSON.parse(value); return parsed.codigo === state.invitation.codigo ? parsed : null; }
    catch (error) { console.warn("No fue posible leer la respuesta local.", error); return null; }
  }
  function showSuccess(payload) {
    elements.form.hidden = true; elements.successState.hidden = false;
    if (payload.asistencia === "Sí") { elements.successTitle.textContent = "¡Nos hará muy felices verte!"; elements.successMessage.textContent = "Gracias por acompañarnos en este día tan especial."; elements.successDetail.textContent = `Confirmaste ${payload.numeroPersonas} ${payload.numeroPersonas === 1 ? "persona" : "personas"}.`; }
    else { elements.successTitle.textContent = "Gracias por avisarnos."; elements.successMessage.textContent = "Te tendremos presente en este día tan especial."; elements.successDetail.textContent = ""; }
  }
  function showSavedResponse(saved) {
    elements.form.hidden = true; elements.savedState.hidden = false; elements.savedAttendance.textContent = saved.asistencia;
    elements.savedPeopleRow.hidden = saved.asistencia !== "Sí"; elements.savedPeople.textContent = saved.numeroPersonas;
  }

  function initializeCountdown() {
    const target = new Date(WEDDING_DATE).getTime();
    const nodes = ["days", "hours", "minutes", "seconds"].map(id => document.getElementById(id));
    function tick() {
      const difference = target - Date.now();
      if (!Number.isFinite(target) || difference <= 0) { document.querySelector("#countdown").hidden = true; document.querySelector("#wedding-day-message").hidden = false; return false; }
      const values = [Math.floor(difference / 86400000), Math.floor(difference / 3600000) % 24, Math.floor(difference / 60000) % 60, Math.floor(difference / 1000) % 60];
      values.forEach((value, index) => { nodes[index].textContent = String(value).padStart(index === 0 ? 3 : 2, "0"); }); return true;
    }
    if (tick()) window.setInterval(tick, 1000);
  }

  function initializeMaps() {
    const button = document.querySelector("#maps-button"); const note = document.querySelector("#maps-note");
    if (MAPS_URL) { button.href = MAPS_URL; button.target = "_blank"; button.removeAttribute("aria-disabled"); note.hidden = true; }
    else button.addEventListener("click", event => event.preventDefault());
  }
  function initializeAnimations() {
    const items = document.querySelectorAll(".reveal");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) { items.forEach(item => item.classList.add("visible")); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); } }), { threshold: .12 });
    items.forEach(item => observer.observe(item));
  }

  function initializeMusic() {
    const button = document.querySelector("#music-toggle");
    const label = document.querySelector("#music-label");
    const playerContainer = document.querySelector("#music-player");
    const videoId = WEDDING_CONFIG.musicVideoId;
    let player = null;
    let isPlaying = false;

    function sendPlayerCommand(command) {
      player?.contentWindow?.postMessage(JSON.stringify({ event: "command", func: command, args: [] }), "*");
    }

    function updateButton() {
      button.classList.toggle("playing", isPlaying);
      button.setAttribute("aria-pressed", String(isPlaying));
      button.setAttribute("aria-label", isPlaying ? "Pausar música de fondo" : "Reproducir música de fondo");
      label.textContent = isPlaying ? "Pausar música" : "Reproducir música";
    }

    button.addEventListener("click", () => {
      if (!player) {
        player = document.createElement("iframe");
        player.title = "Música de fondo";
        player.allow = "autoplay; encrypted-media";
        player.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&loop=1&playlist=${encodeURIComponent(videoId)}&controls=0&enablejsapi=1`;
        playerContainer.append(player);
        isPlaying = true;
      } else {
        isPlaying = !isPlaying;
        sendPlayerCommand(isPlaying ? "playVideo" : "pauseVideo");
      }
      updateButton();
    });
  }

  elements.attendanceButtons.forEach(button => button.addEventListener("click", () => selectAttendance(button.dataset.attendance)));
  elements.decrease.addEventListener("click", () => { state.people -= 1; updatePeople(); }); elements.increase.addEventListener("click", () => { state.people += 1; updatePeople(); });
  elements.message.addEventListener("input", () => { elements.messageCount.textContent = `${elements.message.value.length} / ${MAX_MESSAGE_LENGTH}`; });
  elements.form.addEventListener("submit", handleSubmit);
  elements.modify.addEventListener("click", () => { const saved = readSavedResponse(); if (saved) { selectAttendance(saved.asistencia === "Sí" ? "si" : "no"); state.people = saved.numeroPersonas || 1; updatePeople(); } showForm(); });

  initializeCountdown(); initializeMaps(); initializeAnimations(); initializeMusic(); initializeInvitation();
})();
