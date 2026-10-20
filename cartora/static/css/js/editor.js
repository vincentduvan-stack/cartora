let canvas;
let isLoadingCanvas = false;
let isApplyingHistory = false;
let history = [];
let historyIndex = -1;
let historyTimer;
let changeVersion = 0;
let saveInProgress = false;
let localPreviewMode = false;
const MAX_HISTORY_STATES = 50;
const LOCAL_PREVIEW_STORAGE_KEY = "cartora-menu-editor-preview";

document.addEventListener("DOMContentLoaded", function() {
    configurarVistaPreviaLocal();

    if (typeof fabric === "undefined") {
        setSaveStatus("No se pudo cargar el editor visual", "error");
        console.error("No se pudo cargar Fabric.js; el editor no está disponible.");
        return;
    }

    canvas = new fabric.Canvas("menuCanvas", {
        backgroundColor: "#fffaf1",
        preserveObjectStacking: true,
        selection: true
    });
    canvas.on("object:added", registrarCambio);
    canvas.on("object:modified", registrarCambio);
    canvas.on("object:removed", registrarCambio);
    canvas.on("text:changed", registrarCambio);

    try {
        const dataElement = document.getElementById("initial-canvas-data");
        const rawData = dataElement ? dataElement.textContent.trim() : "{}";
        localPreviewMode = rawData.includes("{{ contenido_json");
        const canvasData = localPreviewMode
            ? cargarBorradorLocal() || { objects: [] }
            : analizarDatosCanvas(rawData);

        if (localPreviewMode) {
            document.getElementById("logout-form")?.setAttribute("hidden", "");
            const previewLink = document.getElementById("public-preview");
            if (previewLink) {
                previewLink.href = "#";
                previewLink.setAttribute("aria-disabled", "true");
                previewLink.title = "Inicia Cartora con Flask para abrir la vista pública.";
                previewLink.addEventListener("click", event => event.preventDefault());
            }
            const saveButton = document.getElementById("save-menu");
            if (saveButton) saveButton.textContent = "Guardar borrador";
        }

        if (canvasData && typeof canvasData === "object" && Array.isArray(canvasData.objects)) {
            isLoadingCanvas = true;
            canvas.loadFromJSON(canvasData, function() {
                canvas.renderAll();
                isLoadingCanvas = false;
                setSaveStatus(localPreviewMode
                    ? "Vista previa local · borrador en este navegador"
                    : "Todos los cambios guardados");
                inicializarHistorial();
            });
        } else {
            inicializarHistorial();
        }
    } catch (error) {
        isLoadingCanvas = false;
        setSaveStatus("No se pudo cargar el menú", "error");
        console.error("Error al cargar el JSON del lienzo:", error);
        inicializarHistorial();
    }

    document.addEventListener("keydown", manejarAtajos);
    document.getElementById("save-menu")?.addEventListener("click", guardarEnServidor);
});

function configurarVistaPreviaLocal() {
    const nameElement = document.getElementById("restaurant-name");
    const restaurantName = nameElement?.dataset.restaurantName;
    if (restaurantName && !restaurantName.includes("{{")) {
        nameElement.textContent = restaurantName;
    }

    const previewLink = document.getElementById("public-preview");
    const slug = previewLink?.dataset.slug;
    if (previewLink && slug && !slug.includes("{{")) {
        previewLink.href = `/m/${encodeURIComponent(slug)}`;
        previewLink.removeAttribute("aria-disabled");
        previewLink.removeAttribute("title");
    }
}

function analizarDatosCanvas(rawData) {
    const parsed = JSON.parse(rawData || "{}");
    return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
}

function cargarBorradorLocal() {
    try {
        const storedData = window.localStorage.getItem(LOCAL_PREVIEW_STORAGE_KEY);
        if (!storedData) return null;
        const canvasData = JSON.parse(storedData);
        if (!canvasData || !Array.isArray(canvasData.objects)) {
            throw new Error("El borrador guardado no tiene un formato válido.");
        }
        return canvasData;
    } catch (error) {
        console.error("No se pudo cargar el borrador local:", error);
        setSaveStatus("No se pudo cargar el borrador local", "error");
        return null;
    }
}

function setSaveStatus(message, state) {
    const status = document.getElementById("save-status");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-saving", state === "saving");
    status.classList.toggle("is-error", state === "error");
}

function marcarCambiosPendientes() {
    if (isLoadingCanvas || isApplyingHistory) return;
    changeVersion += 1;
    setSaveStatus("Cambios sin guardar");
}

function inicializarHistorial() {
    history = [JSON.stringify(canvas.toJSON())];
    historyIndex = 0;
    actualizarBotonesHistorial();
}

function registrarCambio() {
    if (isLoadingCanvas || isApplyingHistory) return;
    marcarCambiosPendientes();
    window.clearTimeout(historyTimer);
    historyTimer = window.setTimeout(guardarEstadoHistorial, 180);
}

function guardarEstadoHistorial() {
    if (!canvas) return;
    const estado = JSON.stringify(canvas.toJSON());
    if (history[historyIndex] === estado) return;
    history = history.slice(0, historyIndex + 1);
    history.push(estado);
    if (history.length > MAX_HISTORY_STATES) history.shift();
    historyIndex = history.length - 1;
    actualizarBotonesHistorial();
}

function actualizarBotonesHistorial() {
    const undoButton = document.getElementById("undo-action");
    const redoButton = document.getElementById("redo-action");
    if (undoButton) undoButton.disabled = historyIndex <= 0;
    if (redoButton) redoButton.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
}

function restaurarEstadoHistorial() {
    isApplyingHistory = true;
    isLoadingCanvas = true;
    canvas.loadFromJSON(history[historyIndex], function() {
        canvas.renderAll();
        isLoadingCanvas = false;
        isApplyingHistory = false;
        actualizarBotonesHistorial();
        marcarCambiosPendientes();
    });
}

function deshacer() {
    if (!canvas) return;
    window.clearTimeout(historyTimer);
    guardarEstadoHistorial();
    if (historyIndex <= 0) return;
    historyIndex -= 1;
    restaurarEstadoHistorial();
}

function rehacer() {
    if (!canvas || historyIndex >= history.length - 1) return;
    window.clearTimeout(historyTimer);
    guardarEstadoHistorial();
    if (historyIndex < history.length - 1) {
        historyIndex += 1;
        restaurarEstadoHistorial();
    }
}

function agregarObjeto(objeto) {
    if (!canvas) return;
    canvas.add(objeto);
    canvas.setActiveObject(objeto);
    canvas.requestRenderAll();
    objeto.enterEditing?.();
    objeto.selectAll?.();
}

function agregarTitulo() {
    agregarObjeto(new fabric.IText("NUEVA SECCIÓN", {
        left: 42, top: 48, fontSize: 27, fontWeight: "bold", fill: "#204b3f",
        fontFamily: "Georgia"
    }));
}

function agregarPlato() {
    agregarObjeto(new fabric.IText("Nombre del plato\nDescripción breve de la casa", {
        left: 42, top: 112, fontSize: 15, lineHeight: 1.35, fill: "#39453d",
        fontFamily: "Arial"
    }));
}

function agregarPrecio() {
    agregarObjeto(new fabric.IText("$12.990", {
        left: 365, top: 112, fontSize: 17, fontWeight: "bold", fill: "#38705a",
        fontFamily: "Arial"
    }));
}

function agregarNota() {
    agregarObjeto(new fabric.IText("✳ Favorito de la casa", {
        left: 42, top: 190, fontSize: 13, fontStyle: "italic", fill: "#c87543",
        fontFamily: "Georgia"
    }));
}

function agregarTextoLibre() {
    agregarObjeto(new fabric.Textbox("Escribe aquí...", {
        left: 42, top: 260, width: 400, fontSize: 16, lineHeight: 1.35,
        fill: "#39453d", fontFamily: "Arial"
    }));
}

function agregarRectangulo() {
    if (!canvas) return;
    const rect = new fabric.Rect({
        left: 30, top: 100, width: 440, height: 62,
        fill: "#edf3e8", stroke: "#d6e2d3", strokeWidth: 1, rx: 5, ry: 5
    });
    canvas.add(rect);
    canvas.sendToBack(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
}

function agregarSeparador() {
    agregarObjeto(new fabric.Line([42, 190, 458, 190], {
        stroke: "#c9b99f", strokeWidth: 1.5, selectable: true
    }));
}

function insertarEjemplo() {
    if (!canvas) return;
    if (canvas.getObjects().length > 0 &&
        !window.confirm("El diseño de ejemplo reemplazará los elementos actuales. ¿Quieres continuar?")) return;

    canvas.getObjects().slice().forEach(objeto => canvas.remove(objeto));
    const sampleObjects = [
        new fabric.IText("LA CARTA", {
            left: 42, top: 35, fontSize: 29, fontWeight: "bold", fill: "#204b3f",
            fontFamily: "Georgia"
        }),
        new fabric.IText("PLATOS PREPARADOS EN CASA", {
            left: 44, top: 78, fontSize: 10, charSpacing: 120, fill: "#8a765c",
            fontFamily: "Arial"
        }),
        new fabric.Line([42, 105, 458, 105], { stroke: "#c9b99f", strokeWidth: 1 }),
        new fabric.IText("PARA COMENZAR", {
            left: 42, top: 129, fontSize: 18, fontWeight: "bold", fill: "#38705a",
            fontFamily: "Georgia"
        }),
        new fabric.IText("Sopa de temporada\nVerduras frescas, hierbas y pan tostado", {
            left: 42, top: 169, fontSize: 13, lineHeight: 1.5, fill: "#39453d",
            fontFamily: "Arial"
        }),
        new fabric.IText("$6.500", {
            left: 390, top: 169, fontSize: 13, fontWeight: "bold", fill: "#204b3f",
            fontFamily: "Arial"
        }),
        new fabric.IText("Empanadas de la casa\nMasa dorada, relleno hecho a fuego lento", {
            left: 42, top: 238, fontSize: 13, lineHeight: 1.5, fill: "#39453d",
            fontFamily: "Arial"
        }),
        new fabric.IText("$8.900", {
            left: 390, top: 238, fontSize: 13, fontWeight: "bold", fill: "#204b3f",
            fontFamily: "Arial"
        }),
        new fabric.Line([42, 305, 458, 305], { stroke: "#e5dccd", strokeWidth: 1 })
    ];
    sampleObjects.forEach(objeto => canvas.add(objeto));
    canvas.setActiveObject(sampleObjects[0]);
    canvas.requestRenderAll();
}

function cambiarFondo(color) {
    if (!canvas) return;
    canvas.setBackgroundColor(color, function() {
        canvas.requestRenderAll();
        const colorPicker = document.querySelector(".custom-color input");
        if (colorPicker) colorPicker.value = color;
        registrarCambio();
    });
}

function obtenerTextosSeleccionados() {
    const activo = canvas?.getActiveObject();
    if (!activo) return [];
    const objetos = activo.type === "activeSelection" ? activo.getObjects() : [activo];
    return objetos.filter(objeto => ["i-text", "textbox", "text"].includes(objeto.type));
}

function aplicarEstiloTexto(propiedad, valor) {
    const textos = obtenerTextosSeleccionados();
    if (!textos.length) {
        alert("Selecciona uno o más elementos de texto para aplicar el formato.");
        return;
    }
    textos.forEach(texto => {
        const inicio = texto.selectionStart;
        const fin = texto.selectionEnd;
        if (texto.isEditing && inicio !== fin && typeof texto.setSelectionStyles === "function") {
            texto.setSelectionStyles({ [propiedad]: valor }, inicio, fin);
        } else {
            texto.set(propiedad, valor);
        }
        texto.setCoords();
    });
    canvas.requestRenderAll();
    registrarCambio();
}

function cambiarTipografia(familia) {
    aplicarEstiloTexto("fontFamily", familia);
}

function cambiarTamanoFuente(valor) {
    const tamano = Number(valor);
    if (!Number.isFinite(tamano) || tamano < 8 || tamano > 64) {
        alert("El tamaño debe estar entre 8 y 64 puntos.");
        return;
    }
    aplicarEstiloTexto("fontSize", tamano);
}

function cambiarColorTexto(color) {
    aplicarEstiloTexto("fill", color);
}

function alternarEstiloTexto(estilo) {
    const textos = obtenerTextosSeleccionados();
    if (!textos.length) {
        alert("Selecciona uno o más elementos de texto para aplicar el formato.");
        return;
    }
    const valor = estilo === "bold"
        ? (textos.every(texto => texto.fontWeight === "bold") ? "normal" : "bold")
        : (textos.every(texto => texto.fontStyle === "italic") ? "normal" : "italic");
    aplicarEstiloTexto(estilo === "bold" ? "fontWeight" : "fontStyle", valor);
}

function alinearTexto(alineacion) {
    aplicarEstiloTexto("textAlign", alineacion);
}

function eliminarSeleccionado() {
    if (!canvas) return;
    const activo = canvas.getActiveObject();
    if (!activo) {
        alert("Selecciona un elemento del menú para eliminarlo.");
        return;
    }
    if (activo.type === "activeSelection") {
        activo.forEachObject(objeto => canvas.remove(objeto));
        canvas.discardActiveObject();
    } else {
        canvas.remove(activo);
    }
    canvas.requestRenderAll();
}

function duplicarSeleccionado() {
    const activo = canvas?.getActiveObject();
    if (!activo) {
        alert("Selecciona un elemento del menú para duplicarlo.");
        return;
    }
    activo.clone(function(copia) {
        copia.set({ left: (activo.left || 0) + 18, top: (activo.top || 0) + 18 });
        canvas.add(copia);
        canvas.setActiveObject(copia);
        canvas.requestRenderAll();
    });
}

function subirCapa() {
    const activo = canvas?.getActiveObject();
    if (!activo) {
        alert("Selecciona un elemento para cambiar su posición.");
        return;
    }
    canvas.bringToFront(activo);
    canvas.requestRenderAll();
    registrarCambio();
}

function bajarCapa() {
    const activo = canvas?.getActiveObject();
    if (!activo) {
        alert("Selecciona un elemento para cambiar su posición.");
        return;
    }
    canvas.sendToBack(activo);
    canvas.requestRenderAll();
    registrarCambio();
}

function limpiarMenu() {
    if (!canvas || canvas.getObjects().length === 0) return;
    if (!window.confirm("¿Quieres quitar todos los elementos de esta página?")) return;
    canvas.clear();
    canvas.setBackgroundColor("#fffaf1", function() {
        canvas.requestRenderAll();
        registrarCambio();
    });
}

function manejarAtajos(event) {
    const target = event.target;
    const escribiendo = target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    if (escribiendo) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        guardarEnServidor();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) rehacer();
        else deshacer();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        rehacer();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicarSeleccionado();
    } else if ((event.key === "Delete" || event.key === "Backspace") && canvas?.getActiveObject()) {
        event.preventDefault();
        eliminarSeleccionado();
    } else if (event.key === "Escape") {
        canvas?.discardActiveObject();
        canvas?.requestRenderAll();
    }
}

async function guardarEnServidor() {
    if (!canvas) {
        alert("El editor todavía no está listo. Recarga la página e inténtalo de nuevo.");
        return;
    }
    if (saveInProgress) return;

    const button = document.getElementById("save-menu");
    const versionAlGuardar = changeVersion;
    saveInProgress = true;
    if (button) button.disabled = true;
    setSaveStatus("Guardando…", "saving");
    try {
        if (localPreviewMode) {
            window.localStorage.setItem(LOCAL_PREVIEW_STORAGE_KEY, JSON.stringify(canvas.toJSON()));
            setSaveStatus(versionAlGuardar === changeVersion
                ? "Borrador guardado en este navegador"
                : "Cambios sin guardar");
            return;
        }

        const response = await fetch("/api/guardar-menu", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": document.querySelector('meta[name="csrf-token"]')?.content || ""
            },
            body: JSON.stringify({ canvas: canvas.toJSON() })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || "No se pudo guardar el menú.");
        }
        setSaveStatus(versionAlGuardar === changeVersion
            ? "Todos los cambios guardados"
            : "Cambios sin guardar");
    } catch (error) {
        setSaveStatus("Error al guardar", "error");
        console.error("Error al guardar el menú:", error);
        alert(error.message || "Ocurrió un error al guardar el menú.");
    } finally {
        saveInProgress = false;
        if (button) button.disabled = false;
    }
}
