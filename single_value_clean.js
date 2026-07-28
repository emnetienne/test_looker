/**
 * ============================================================================
 *  Valeur simple (sans cadre) — Visualisation custom Looker
 * ----------------------------------------------------------------------------
 *  Remplace le "Single Value" : affiche UNIQUEMENT le libellé + la valeur,
 *  fond 100% transparent, aucun cadre / bordure / carré blanc.
 *  La taille du texte s'ajuste automatiquement à la tuile (comme le single value).
 *
 *  Entrée : un champ (dimension ou mesure). Prend la 1re valeur de la requête.
 * ============================================================================
 */

looker.plugins.visualizations.add({
  id: "single_value_clean",
  label: "Valeur simple (sans cadre)",

  options: {
    label_text: {
      section: "Libellé", type: "string", label: "Libellé (vide = nom du champ)",
      default: "", order: 1
    },
    show_label: {
      section: "Libellé", type: "boolean", label: "Afficher le libellé",
      default: true, order: 2
    },
    label_position: {
      section: "Libellé", type: "string", label: "Position du libellé",
      display: "select", values: [{ "En dessous": "below" }, { "Au dessus": "above" }],
      default: "below", order: 3
    },
    label_color: {
      section: "Libellé", type: "string", label: "Couleur du libellé",
      display: "color", default: "#6B7A90", order: 4
    },

    value_color: {
      section: "Valeur", type: "string", label: "Couleur de la valeur",
      display: "color", default: "#1F2D4D", order: 1
    },
    value_bold: {
      section: "Valeur", type: "boolean", label: "Valeur en gras",
      default: false, order: 2
    },
    value_size: {
      section: "Valeur", type: "number", label: "Taille valeur en px (0 = auto)",
      default: 0, order: 3
    },

    align: {
      section: "Mise en page", type: "string", label: "Alignement",
      display: "select",
      values: [{ "Centré": "center" }, { "Gauche": "flex-start" }, { "Droite": "flex-end" }],
      default: "center", order: 1
    }
  },

  create: function (element, config) {
    element.innerHTML =
      '<style>' +
      '  .svc-root { width:100%; height:100%; display:flex; flex-direction:column;' +
      '    justify-content:center; box-sizing:border-box; padding:6px 10px;' +
      '    background:transparent; overflow:hidden;' +
      '    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; }' +
      '  .svc-value { line-height:1.05; white-space:nowrap; }' +
      '  .svc-label { line-height:1.2; white-space:nowrap; margin-top:2px; }' +
      '</style>' +
      '<div class="svc-root">' +
      '  <div class="svc-label" style="order:2"></div>' +
      '  <div class="svc-value" style="order:1"></div>' +
      '</div>';

    this._element = element;
    this._root  = element.querySelector(".svc-root");
    this._value = element.querySelector(".svc-value");
    this._label = element.querySelector(".svc-label");

    var self = this;
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () {
        if (self._raf) cancelAnimationFrame(self._raf);
        self._raf = requestAnimationFrame(function () { self._render(); });
      });
      this._ro.observe(element);
    }
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();

    var fields = []
      .concat(queryResponse.fields.dimensions || [])
      .concat(queryResponse.fields.measures || []);

    if (!fields.length || !data.length) {
      this._valueText = "";
      this._fieldLabel = "";
    } else {
      var f = fields[0];
      var cell = data[0][f.name];
      this._valueText = cell
        ? (cell.rendered != null && cell.rendered !== "" ? cell.rendered : String(cell.value != null ? cell.value : ""))
        : "";
      this._fieldLabel = f.label_short || f.label || f.name;
    }

    this._config = config;
    this._render();
    done();
  },

  _render: function () {
    var config = this._config || {};
    var root = this._root, valEl = this._value, lblEl = this._label;
    if (!root) return;

    // Contenu
    var labelStr = (config.label_text && config.label_text.trim())
      ? config.label_text : (this._fieldLabel || "");
    var showLabel = config.show_label !== false && labelStr !== "";

    valEl.textContent = this._valueText || "—";
    lblEl.textContent = labelStr;
    lblEl.style.display = showLabel ? "" : "none";

    // Styles
    root.style.alignItems = config.align || "center";
    var textAlign = config.align === "flex-start" ? "left"
                  : config.align === "flex-end" ? "right" : "center";
    valEl.style.textAlign = textAlign;
    lblEl.style.textAlign = textAlign;
    valEl.style.color = config.value_color || "#1F2D4D";
    valEl.style.fontWeight = config.value_bold ? "700" : "500";
    lblEl.style.color = config.label_color || "#6B7A90";
    lblEl.style.fontWeight = "500";

    // Ordre libellé / valeur
    lblEl.style.order = (config.label_position === "above") ? "1" : "2";
    valEl.style.order = (config.label_position === "above") ? "2" : "1";
    lblEl.style.marginTop = (config.label_position === "above") ? "0" : "2px";
    lblEl.style.marginBottom = (config.label_position === "above") ? "2px" : "0";

    // Dimensions dispo
    var W = this._element.clientWidth || 300;
    var H = this._element.clientHeight || 120;
    var availW = W * 0.94;

    // Taille de la valeur : fixe si demandé, sinon auto-ajustée
    var fixed = Number(config.value_size) > 0 ? Number(config.value_size) : 0;
    var valBudgetH = H * (showLabel ? 0.6 : 0.9);

    var vSize;
    if (fixed) {
      vSize = fixed;
      valEl.style.fontSize = vSize + "px";
    } else {
      vSize = fitText(valEl, availW, valBudgetH);
    }

    // Libellé : proportionnel à la valeur, borné, puis ajusté à la largeur
    if (showLabel) {
      var lSize = Math.max(10, Math.min(vSize * 0.34, H * 0.22));
      lblEl.style.fontSize = lSize + "px";
      fitText(lblEl, availW, H * 0.28, lSize);
    }
  }
});

/* Ajuste la taille de police pour tenir dans (maxW x maxH). */
function fitText(el, maxW, maxH, startSize) {
  var size = startSize || Math.max(8, maxH);
  el.style.fontSize = size + "px";
  for (var i = 0; i < 14; i++) {
    var w = el.scrollWidth, h = el.scrollHeight;
    if ((w <= maxW && h <= maxH) || size <= 8) break;
    var ratio = Math.min(maxW / (w || 1), maxH / (h || 1));
    size = Math.max(8, size * Math.min(ratio, 0.985));
    el.style.fontSize = size + "px";
  }
  return size;
}
