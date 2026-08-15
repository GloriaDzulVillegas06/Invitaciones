const PHOTO_CONFIG = Object.freeze({
  googleScriptUrl: "https://script.google.com/macros/s/AKfycbxckvAVytpgrrxH3Yly6bb2ENyomWUVjl4Tw-dQYZKhhQuA48qIsD1wZ0pUv6a6VhZl/exec",
  maxFilesPerBatch: 15,
  maxDimension: 2400,
  jpegQuality: 0.85,
  maxOriginalFileSize: 20 * 1024 * 1024,
  developmentMode: false,
  simulatedDelayMs: 550
});

const MAX_ORIGINAL_FILE_SIZE = PHOTO_CONFIG.maxOriginalFileSize;

(() => {
  "use strict";

  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const state = { photos: [], uploading: false, nextId: 1 };
  const elements = {
    selectionView: document.querySelector("#selection-view"), name: document.querySelector("#guest-name"), picker: document.querySelector("#picker"),
    input: document.querySelector("#photo-input"), message: document.querySelector("#selection-message"), previewSection: document.querySelector("#preview-section"),
    count: document.querySelector("#selected-count"), grid: document.querySelector("#preview-grid"), clear: document.querySelector("#clear-all"), upload: document.querySelector("#upload-button"),
    progressView: document.querySelector("#progress-view"), progressFile: document.querySelector("#progress-file"), progressTrack: document.querySelector(".progress-track"),
    progressBar: document.querySelector("#progress-bar"), progressCount: document.querySelector("#progress-count"), resultView: document.querySelector("#result-view"),
    resultTitle: document.querySelector("#result-title"), resultMessage: document.querySelector("#result-message"), signature: document.querySelector("#result-signature"),
    summary: document.querySelector("#result-summary"), failedList: document.querySelector("#failed-list"), retry: document.querySelector("#retry-button"), more: document.querySelector("#more-button")
  };

  function sanitizeName(value) { return value.trim().replace(/\s+/g, " ").slice(0, 80) || "Invitado"; }
  function pluralizePhotos(count) { return `${count} ${count === 1 ? "foto seleccionada" : "fotos seleccionadas"}`; }
  function isAllowed(file) { return ALLOWED_TYPES.has(file.type.toLowerCase()); }
  function isOversized(file) { return file.size > MAX_ORIGINAL_FILE_SIZE; }
  function setMessage(title = "", detail = "") {
    elements.message.replaceChildren();
    if (!title) return;
    const strong = document.createElement("strong"); strong.textContent = title;
    const span = document.createElement("span"); span.textContent = detail;
    elements.message.append(strong, span);
  }

  function makePhoto(file) {
    const validType = isAllowed(file);
    const oversized = isOversized(file);
    return {
      id: state.nextId++, file, previewUrl: validType ? URL.createObjectURL(file) : null,
      valid: validType && !oversized, error: !validType ? "Formato no compatible" : oversized ? "Archivo mayor de 20 MB" : "",
      status: "pending", attempts: 0
    };
  }

  function addSelectedFiles(fileList) {
    if (state.uploading) return;
    const incoming = [...fileList];
    const available = PHOTO_CONFIG.maxFilesPerBatch - state.photos.length;
    if (incoming.length > available) {
      setMessage("Puedes subir hasta 15 fotos por vez.", "Cuando terminen, podrás subir todas las que quieras en otra tanda.");
    } else setMessage();
    incoming.slice(0, Math.max(0, available)).forEach(file => state.photos.push(makePhoto(file)));
    elements.input.value = "";
    renderPreviews();
  }

  function releasePreview(photo) { if (photo.previewUrl) { URL.revokeObjectURL(photo.previewUrl); photo.previewUrl = null; } }
  function removePhoto(id) {
    if (state.uploading) return;
    const index = state.photos.findIndex(photo => photo.id === id);
    if (index < 0) return;
    releasePreview(state.photos[index]); state.photos.splice(index, 1); setMessage(); renderPreviews();
  }
  function clearPhotos() { state.photos.forEach(releasePreview); state.photos = []; elements.input.value = ""; setMessage(); renderPreviews(); }

  function renderPreviews() {
    elements.grid.replaceChildren();
    elements.previewSection.hidden = state.photos.length === 0;
    elements.count.textContent = pluralizePhotos(state.photos.length);
    state.photos.forEach(photo => {
      const item = document.createElement("article"); item.className = `preview-item${photo.valid ? "" : " invalid"}`;
      if (photo.previewUrl) {
        const image = document.createElement("img"); image.src = photo.previewUrl; image.alt = ""; image.loading = "lazy"; item.append(image);
      }
      if (!photo.valid) { const error = document.createElement("span"); error.textContent = photo.error; item.append(error); }
      const name = document.createElement("span"); name.className = "preview-name"; name.textContent = photo.file.name; item.append(name);
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `Eliminar ${photo.file.name}`); remove.addEventListener("click", () => removePhoto(photo.id)); item.append(remove);
      elements.grid.append(item);
    });
    elements.upload.disabled = state.uploading || !state.photos.some(photo => photo.valid);
  }

  function setUploading(active) {
    state.uploading = active; elements.input.disabled = active; elements.name.disabled = active; elements.clear.disabled = active; elements.upload.disabled = active;
    elements.picker.classList.toggle("disabled", active);
  }

  async function loadBitmap(file) {
    if ("createImageBitmap" in window) return createImageBitmap(file, { imageOrientation: "from-image" });
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.decoding = "async";
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("No se pudo leer la imagen")); image.src = url; });
      return image;
    } finally { URL.revokeObjectURL(url); }
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("No se pudo optimizar la imagen")), type, quality));
  }

  async function compressPhoto(photo) {
    const source = await loadBitmap(photo.file);
    try {
      const sourceWidth = source.width || source.naturalWidth; const sourceHeight = source.height || source.naturalHeight;
      const scale = Math.min(1, PHOTO_CONFIG.maxDimension / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale)); const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("El navegador no pudo preparar la imagen");
      context.fillStyle = "#F8F1E4"; context.fillRect(0, 0, width, height); context.drawImage(source, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, "image/jpeg", PHOTO_CONFIG.jpegQuality);
      canvas.width = 1; canvas.height = 1;
      return blob.size < photo.file.size || scale < 1 ? blob : photo.file;
    } finally { if (typeof source.close === "function") source.close(); }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("No se pudo preparar el archivo")); reader.readAsDataURL(blob);
    });
  }

  async function sendPhotoToAppsScript(blob, photo, guestName) {
    if (PHOTO_CONFIG.developmentMode) {
      await new Promise(resolve => window.setTimeout(resolve, PHOTO_CONFIG.simulatedDelayMs));
      if (/fallo/i.test(photo.file.name) && photo.attempts === 1) throw new Error("Error simulado para probar el reintento");
      return { ok: true };
    }
    if (!PHOTO_CONFIG.googleScriptUrl || PHOTO_CONFIG.googleScriptUrl === "PEGAR_AQUI_URL_APPS_SCRIPT_FOTOS") throw new Error("El servicio de fotografías aún no está configurado");
    const payload = { accion: "subirFoto", nombre: guestName, archivo: { nombre: photo.file.name, tipo: blob.type || "image/jpeg", base64: await blobToBase64(blob) } };
    const response = await fetch(PHOTO_CONFIG.googleScriptUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`Error de conexión (${response.status})`);
    const result = await response.json();
    if (result?.ok !== true) throw new Error(result?.error || "El servidor no pudo guardar la fotografía");
    return result;
  }

  function updateProgress(completed, total, filename) {
    const percentage = total ? Math.round(completed / total * 100) : 0;
    elements.progressFile.textContent = filename ? `Procesando ${filename}` : "Preparando tus fotografías";
    elements.progressBar.style.width = `${percentage}%`; elements.progressTrack.setAttribute("aria-valuenow", String(percentage)); elements.progressCount.textContent = `${completed} de ${total}`;
  }

  async function uploadPhotos(photos) {
    setUploading(true); elements.selectionView.hidden = true; elements.resultView.hidden = true; elements.progressView.hidden = false;
    const guestName = sanitizeName(elements.name.value); let completed = 0;
    updateProgress(0, photos.length, "");
    for (const photo of photos) {
      photo.status = "uploading"; photo.error = ""; photo.attempts += 1; updateProgress(completed, photos.length, photo.file.name);
      try { const optimized = await compressPhoto(photo); await sendPhotoToAppsScript(optimized, photo, guestName); photo.status = "uploaded"; }
      catch (error) { console.error(`No se pudo subir ${photo.file.name}:`, error); photo.status = "failed"; photo.error = error instanceof Error ? error.message : "Error desconocido"; }
      completed += 1; updateProgress(completed, photos.length, photo.file.name);
    }
    showResult(); setUploading(false);
  }

  function appendSummary(label, count) {
    const row = document.createElement("p"); const text = document.createElement("span"); const value = document.createElement("strong");
    text.textContent = label; value.textContent = String(count); row.append(text, value); elements.summary.append(row);
  }

  function showResult() {
    elements.progressView.hidden = true; elements.resultView.hidden = false; elements.summary.replaceChildren(); elements.failedList.replaceChildren();
    const uploaded = state.photos.filter(photo => photo.status === "uploaded"); const failed = state.photos.filter(photo => photo.status === "failed");
    appendSummary(uploaded.length === 1 ? "Foto guardada" : "Fotos guardadas", uploaded.length);
    if (failed.length) appendSummary(failed.length === 1 ? "Foto pendiente" : "Fotos pendientes", failed.length);
    failed.forEach(photo => { const line = document.createElement("p"); line.textContent = `⚠ ${photo.file.name}: ${photo.error}`; elements.failedList.append(line); });
    if (!failed.length) {
      elements.resultTitle.textContent = "¡Recibimos tus fotos!"; elements.resultMessage.textContent = "Gracias por regalarnos un pedacito de esta noche visto desde tus ojos."; elements.signature.textContent = "Gloria & Jessica ♡"; elements.retry.hidden = true;
    } else {
      elements.resultTitle.textContent = uploaded.length ? "Algunas fotos siguen pendientes" : "No pudimos terminar de subir tus fotos.";
      elements.resultMessage.textContent = navigator.onLine ? "Conservamos las fotos pendientes para que puedas intentarlo nuevamente." : "Parece que la conexión se interrumpió.";
      elements.signature.textContent = ""; elements.retry.textContent = failed.length === 1 ? "Reintentar 1 foto" : `Reintentar ${failed.length} fotos`; elements.retry.hidden = false;
    }
  }

  function startNewBatch() { clearPhotos(); elements.resultView.hidden = true; elements.progressView.hidden = true; elements.selectionView.hidden = false; elements.name.disabled = false; elements.picker.classList.remove("disabled"); elements.name.focus(); }

  elements.input.addEventListener("change", event => addSelectedFiles(event.target.files));
  elements.clear.addEventListener("click", clearPhotos);
  elements.upload.addEventListener("click", () => uploadPhotos(state.photos.filter(photo => photo.valid && photo.status !== "uploaded")));
  elements.retry.addEventListener("click", () => uploadPhotos(state.photos.filter(photo => photo.status === "failed")));
  elements.more.addEventListener("click", startNewBatch);
  window.addEventListener("beforeunload", () => state.photos.forEach(releasePreview));
})();
