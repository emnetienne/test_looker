/**
 * ============================================================================
 *  Répartition par segment (Waterfall) — Visualisation custom Looker
 * ----------------------------------------------------------------------------
 *  Waterfall cumulatif qui reprend le design du PPT (slides 2 & 3) :
 *    - Barres incrémentales corail  #EC6A4E
 *    - Barre "Total" périwinkle      #7C93D9
 *    - Libellés bleu marine          #1F2D4D
 *
 *  Chaque barre affiche sa VALEUR et son POURCENTAGE du total.
 *  Titre masqué par défaut (déjà présent sur la slide) — réactivable via l'option.
 *
 *  Données attendues : 1 dimension (segment) + 1 mesure (valeur).
 * ============================================================================
 */

looker.plugins.visualizations.add({
  id: "waterfall_shoppers",
  label: "Répartition par segment (Waterfall)",

  options: {
    title_text: {
      section: "Style", type: "string", label: "Titre",
      default: "", order: 1
    },
    show_title: {
      section: "Style", type: "boolean", label: "Afficher le titre",
      default: false, order: 2
    },
    card_style: {
      section: "Style", type: "string", label: "Fond", display: "select",
      values: [{ "Carte blanche": "card" }, { "Transparent": "flat" }],
      default: "card", order: 3
    },
    bar_color: {
      section: "Style", type: "string", label: "Couleur barres", display: "color",
      default: "#FECF6B", order: 4
    },
    total_color: {
      section: "Style", type: "string", label: "Couleur barre Total", display: "color",
      default: "#B6C1E9", order: 5
    },

    show_total: {
      section: "Données", type: "boolean", label: "Ajouter la barre Total",
      default: true, order: 1
    },
    total_label: {
      section: "Données", type: "string", label: "Libellé du Total",
      default: "Total", order: 2
    },
    show_value: {
      section: "Données", type: "boolean", label: "Afficher les valeurs",
      default: true, order: 3
    },
    show_percent: {
      section: "Données", type: "boolean", label: "Afficher les pourcentages",
      default: true, order: 4
    },
    percent_decimals: {
      section: "Données", type: "number", label: "Décimales du %",
      default: 1, order: 5
    },
    show_axis_labels: {
      section: "Données", type: "boolean", label: "Afficher les noms de segment",
      default: true, order: 6
    }
  },

  /* ----------------------------------------------------------------------- */
  create: function (element, config) {
    element.innerHTML = "";

    var style = document.createElement("style");
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
      .wf-root {
        --ink:#1F2D4D; --ink-soft:#2C3A57; --divider:#DFDCD4;
        box-sizing:border-box; width:100%; height:100%; padding:10px; margin:0;
        font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;
        -webkit-font-smoothing:antialiased;
      }
      .wf-root *, .wf-root *::before, .wf-root *::after { box-sizing:border-box; }
      .wf-card {
        width:100%; height:100%; display:flex; flex-direction:column;
        border-radius:20px; padding:20px 24px 14px 24px; overflow:hidden;
      }
      .wf-card.style-card { background:#FFFFFF; box-shadow:0 12px 34px rgba(31,45,77,0.08); }
      .wf-card.style-flat { background:transparent; box-shadow:none; padding:8px; }
      .wf-title-wrap { flex:0 0 auto; text-align:center; margin-bottom:8px; }
      .wf-title {
        display:inline-block; font-family:'Poppins','Inter',sans-serif; font-weight:600;
        font-size:18px; color:var(--ink); padding-bottom:6px;
        border-bottom:2px dotted var(--divider);
      }
      .wf-chart { flex:1 1 auto; min-height:0; width:100%; }
      .wf-empty { flex:1 1 auto; display:flex; align-items:center; justify-content:center;
        color:#93A0B8; font-size:14px; }
    `;
    element.appendChild(style);

    this._root = document.createElement("div");
    this._root.className = "wf-root";
    this._root.innerHTML =
      '<div class="wf-card">' +
        '<div class="wf-title-wrap"><span class="wf-title"></span></div>' +
        '<div class="wf-chart"></div>' +
      "</div>";
    element.appendChild(this._root);

    this._card    = this._root.querySelector(".wf-card");
    this._titleW  = this._root.querySelector(".wf-title-wrap");
    this._titleEl = this._root.querySelector(".wf-title");
    this._chart   = this._root.querySelector(".wf-chart");

    // Re-render au redimensionnement de la tuile (responsive)
    var self = this;
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () {
        if (self._raf) cancelAnimationFrame(self._raf);
        self._raf = requestAnimationFrame(function () { self._render(); });
      });
      this._ro.observe(this._chart);
    }
  },

  /* ----------------------------------------------------------------------- */
  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();

    var dims = queryResponse.fields.dimensions || [];
    var meas = queryResponse.fields.measures || [];
    if (!dims.length || !meas.length) {
      this.addError({
        title: "Champs requis",
        message: "Ajoutez 1 dimension (segment) et 1 mesure (valeur)."
      });
      done();
      return;
    }

    var dName = dims[0].name;
    var mName = meas[0].name;

    var rows = data.map(function (r) {
      var d = r[dName], m = r[mName];
      return {
        label: d ? (d.value != null ? String(d.value) : (d.rendered || "")) : "",
        value: m ? Number(m.value) || 0 : 0
      };
    });

    // On mémorise l'état pour pouvoir re-render au resize
    this._data = rows;
    this._config = config;
    this._render();
    done();
  },

  /* ----------------------------------------------------------------------- */
  /*  Rendu SVG (appelé par updateAsync ET par le ResizeObserver)             */
  /* ----------------------------------------------------------------------- */
  _render: function () {
    var config = this._config || {};
    var rows = this._data || [];

    // Titre + style de carte
    this._card.className = "wf-card " + (config.card_style === "flat" ? "style-flat" : "style-card");
    var showTitle = config.show_title === true && !!(config.title_text || "").trim();
    this._titleW.style.display = showTitle ? "" : "none";
    this._titleEl.textContent = config.title_text || "";

    if (!rows.length) {
      this._chart.innerHTML = '<div class="wf-empty">Aucune donnée</div>';
      return;
    }

    // Dimensions réelles de la zone graphique
    var W = this._chart.clientWidth || 800;
    var H = this._chart.clientHeight || 360;
    if (W < 40 || H < 40) return;

    // --- Options ---------------------------------------------------------
    var barColor   = config.bar_color   || "#EC6A4E";
    var totalColor = config.total_color || "#7C93D9";
    var showTotal  = config.show_total  !== false;
    var showValue  = config.show_value  !== false;
    var showPct    = config.show_percent !== false;
    var showLbl    = config.show_axis_labels !== false;
    var dec        = (config.percent_decimals != null) ? Number(config.percent_decimals) : 1;
    var totalLabel = config.total_label || "Total";

    // --- Construction du waterfall (cumul) -------------------------------
    var sum = rows.reduce(function (a, r) { return a + r.value; }, 0);
    var cum = 0, dMax = 0, dMin = 0;
    var segs = rows.map(function (r) {
      var start = cum; cum += r.value; var end = cum;
      dMax = Math.max(dMax, start, end); dMin = Math.min(dMin, start, end);
      return { label: r.label, value: r.value, start: start, end: end, total: false };
    });
    if (showTotal) {
      segs.push({ label: totalLabel, value: sum, start: 0, end: sum, total: true });
      dMax = Math.max(dMax, sum); dMin = Math.min(dMin, 0);
    }
    if (dMax === dMin) dMax = dMin + 1;

    // --- Marges & échelle ------------------------------------------------
    var mTop = 30, mBottom = showLbl ? 54 : 16, mL = 12, mR = 12;
    var plotTop = mTop, plotBottom = H - mBottom;
    var plotH = Math.max(10, plotBottom - plotTop);
    var n = segs.length;
    var slot = (W - mL - mR) / n;
    var barW = Math.max(14, Math.min(slot * 0.62, 190));

    function yScale(v) { return plotBottom - ((v - dMin) / (dMax - dMin)) * plotH; }
    function cx(i) { return mL + slot * (i + 0.5); }

    // --- Tailles de police des KPI / % (agrandies) -----------------------
    // Légèrement adaptatives à la largeur de barre pour rester lisibles,
    // mais nettement plus grandes qu'avant.
    var scale = Math.max(0.85, Math.min(1.25, barW / 130));
    var VAL_IN   = Math.round(22 * scale);  // valeur, dans la barre
    var PCT_IN   = Math.round(16 * scale);  // %, dans la barre
    var VAL_UP   = Math.round(19 * scale);  // valeur, au-dessus (barre courte)
    var PCT_UP   = Math.round(14 * scale);  // %, au-dessus

    // --- Helpers formatage FR -------------------------------------------
    var nfInt = new Intl.NumberFormat("fr-FR");
    function fmtInt(v) { return nfInt.format(Math.round(v)); }
    function fmtPct(v) {
      if (!sum) return "0\u00A0%";
      var p = (v / sum) * 100;
      return new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: dec, maximumFractionDigits: dec
      }).format(p) + "\u00A0%";
    }
    function esc(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }
    function wrap(label, maxChars) {
      var words = String(label).split(/\s+/), lines = [], cur = "";
      for (var i = 0; i < words.length; i++) {
        var t = cur ? cur + " " + words[i] : words[i];
        if (t.length > maxChars && cur) { lines.push(cur); cur = words[i]; }
        else cur = t;
        if (lines.length === 1 && cur.length > maxChars) break;
      }
      if (cur) lines.push(cur);
      if (lines.length > 2) { lines = lines.slice(0, 2); lines[1] = lines[1].slice(0, maxChars - 1) + "…"; }
      return lines;
    }

    // --- Génération SVG --------------------------------------------------
    var INK = "#1F2D4D";
    var svg = '<svg width="100%" height="100%" viewBox="0 0 ' + W + ' ' + H +
              '" preserveAspectRatio="xMidYMid meet" font-family="Poppins,Inter,sans-serif">';

    // ligne de base (niveau 0)
    var y0 = yScale(0);
    svg += '<line x1="' + mL + '" y1="' + y0 + '" x2="' + (W - mR) + '" y2="' + y0 +
           '" stroke="#E4E1D9" stroke-width="1"/>';

    // connecteurs pointillés entre sommets cumulés
    for (var i = 0; i < n - 1; i++) {
      var yLink = yScale(segs[i].end);
      var x1 = cx(i) + barW / 2, x2 = cx(i + 1) - barW / 2;
      svg += '<line x1="' + x1 + '" y1="' + yLink + '" x2="' + x2 + '" y2="' + yLink +
             '" stroke="#B9B5AC" stroke-width="1.4" stroke-dasharray="2 4"/>';
    }

    // seuil de hauteur pour placer les libellés DANS la barre (ajusté aux polices)
    var insideThreshold = VAL_IN + PCT_IN + 14;

    // barres + libellés
    for (var j = 0; j < n; j++) {
      var s = segs[j];
      var top = Math.min(yScale(s.start), yScale(s.end));
      var bot = Math.max(yScale(s.start), yScale(s.end));
      var h = Math.max(1, bot - top);
      var x = cx(j) - barW / 2;
      var color = s.total ? totalColor : barColor;

      svg += '<rect x="' + x + '" y="' + top + '" width="' + barW + '" height="' + h +
             '" rx="3" fill="' + color + '"/>';

      // libellé valeur + %
      var cxj = cx(j);
      var valTxt = showValue ? fmtInt(s.value) : "";
      var pctTxt = showPct ? fmtPct(s.value) : "";
      if (valTxt || pctTxt) {
        var twoLines = valTxt && pctTxt;
        if (h >= insideThreshold) {
          var mid = top + h / 2;
          if (valTxt)
            svg += '<text x="' + cxj + '" y="' + (mid + (twoLines ? -PCT_IN * 0.55 : PCT_IN * 0.35)) +
                   '" text-anchor="middle" font-weight="700" font-size="' + VAL_IN +
                   '" fill="' + INK + '">' + esc(valTxt) + '</text>';
          if (pctTxt)
            svg += '<text x="' + cxj + '" y="' + (mid + VAL_IN * 0.62 + PCT_IN * 0.4) +
                   '" text-anchor="middle" font-family="Inter" font-weight="600" font-size="' + PCT_IN +
                   '" fill="' + INK + '" opacity="0.75">' + esc(pctTxt) + '</text>';
        } else {
          // barre trop courte : étiquettes AU-DESSUS
          var yb = top - 8;
          if (pctTxt)
            svg += '<text x="' + cxj + '" y="' + yb + '" text-anchor="middle" ' +
                   'font-family="Inter" font-weight="600" font-size="' + PCT_UP +
                   '" fill="' + INK + '" opacity="0.75">' + esc(pctTxt) + '</text>';
          if (valTxt)
            svg += '<text x="' + cxj + '" y="' + (yb - (pctTxt ? PCT_UP + 4 : 0)) +
                   '" text-anchor="middle" font-weight="700" font-size="' + VAL_UP +
                   '" fill="' + INK + '">' + esc(valTxt) + '</text>';
        }
      }

      // libellé de segment (axe X)
      if (showLbl) {
        var maxChars = Math.max(6, Math.floor(slot / 7));
        var lines = wrap(s.label, maxChars);
        var ly = plotBottom + 18;
        for (var k = 0; k < lines.length; k++) {
          svg += '<text x="' + cxj + '" y="' + (ly + k * 15) + '" text-anchor="middle" ' +
                 'font-family="Inter" font-weight="' + (s.total ? 700 : 600) + '" ' +
                 'font-size="12.5" fill="' + INK + '">' + esc(lines[k]) + '</text>';
        }
      }
    }

    svg += "</svg>";
    this._chart.innerHTML = svg;
  }
});
