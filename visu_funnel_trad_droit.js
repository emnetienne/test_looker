looker.plugins.visualizations.add({
  id: "funnel_mirror",
  label: "Funnel (miroir)",
  options: {
    stageColors: {
      type: "array",
      label: "Custom Stage Colors (Comma-separated)",
      default: ["#5D8EC2", "#2B5278", "#4A154B", "#6B0D38", "#3B1E08"],
      section: "Style"
    }
  },

  create: function (element, config) {
    element.style.height = "100%";
    element.style.width = "100%";
    element.style.padding = "0px";
    element.style.margin = "0px";
    element.style.display = "flex";
    element.style.overflow = "hidden";

    element.innerHTML = `
      <style>
        .funnel-container {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Arial, sans-serif;
          box-sizing: border-box;
          overflow: hidden;
        }
        .funnel-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .funnel-value-text {
          font-weight: bold;
          fill: #ffffff;
          text-anchor: middle;
          dominant-baseline: central;
        }
        .funnel-label-text {
          font-weight: bold;
          fill: #ffffff;
          text-anchor: middle;
          dominant-baseline: central;
        }
      </style>
      <div class="funnel-container">
        <svg class="funnel-svg" id="funnelSvg"></svg>
      </div>
    `;

    this._element = element;
    this._svg = element.querySelector("#funnelSvg");

    var self = this;
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () {
        if (self._raf) cancelAnimationFrame(self._raf);
        self._raf = requestAnimationFrame(function () { self._draw(); });
      });
      this._ro.observe(element);
    }
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();

    if (!data || data.length === 0) {
      this.addError({ title: "No Data", message: "This visualization requires data rows or measures." });
      return;
    }

    // Renommage ciblé (identique à la version normale)
    const RENAME_RULES = [
      { keywords: ["trad"], to: "Nombre de client acheteurs de produits animés" }
    ];
    const norm = (s) => (s == null ? "" : String(s))
      .replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const displayLabel = (stage) => {
      const hay = norm((stage.key || "") + " " + (stage.label || ""));
      for (const r of RENAME_RULES) {
        if (r.keywords.every((k) => hay.includes(norm(k)))) return r.to;
      }
      return stage.label;
    };

    let stages = [];
    if (data.length === 1 && queryResponse.fields.measure_like.length > 1) {
      const row = data[0];
      queryResponse.fields.measure_like.forEach((field) => {
        stages.push({
          key: field.name,
          label: field.label_short || field.label,
          value: row[field.name]?.value || 0
        });
      });
    } else {
      const dimKey = queryResponse.fields.dimension_like[0]?.name;
      const measureKey = queryResponse.fields.measure_like[0]?.name;
      stages = data.map((row) => {
        const lbl = dimKey ? row[dimKey]?.value : "Stage";
        return { key: lbl, label: lbl, value: measureKey ? row[measureKey]?.value : 0 };
      });
    }

    this._stages = stages;
    this._config = config;
    this._displayLabel = displayLabel;
    this._draw();
    done();
  },

  /* ------------------------------------------------------------------------ */
  /*  MIROIR : entonnoir à DROITE, bandes/libellés vers la GAUCHE              */
  /* ------------------------------------------------------------------------ */
  _draw: function () {
    const stages = this._stages || [];
    const config = this._config || {};
    const displayLabel = this._displayLabel || ((s) => s.label);
    const element = this._element;
    const svg = this._svg;
    if (!svg || !stages.length) return;

    svg.innerHTML = "";
    const SVGNS = "http://www.w3.org/2000/svg";

    const totalStages = stages.length;
    if (totalStages === 0) return;

    const W = element.clientWidth || 1000;
    const H = element.clientHeight || 650;
    if (W < 20 || H < 20) return;

    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const defaultColors = ["#5D8EC2", "#2B5278", "#4A154B", "#6B0D38", "#3B1E08"];
    const colors = config.stageColors && config.stageColors.length > 0 ? config.stageColors : defaultColors;

    // --- Géométrie horizontale MIROIR ------------------------------------
    const funnelCenterX  = 0.68 * W;   // entonnoir à DROITE (miroir de 0.32)
    const maxTopWidth    = 0.26 * W;
    const minBottomWidth = 0.06 * W;
    const bannerLeftX    = 0.01 * W;   // la bande s'étend vers la GAUCHE

    // --- Géométrie verticale (marges pour ne rien couper) ----------------
    const pad = Math.max(6, 0.02 * H);
    let ry = 0.028 * H;
    let stageHeight = (H - 2 * ry - 2 * pad) / totalStages;
    if (stageHeight < 12) { stageHeight = (H - 2 * pad) / totalStages; ry = stageHeight * 0.30; }
    ry = Math.min(ry, stageHeight * 0.38);
    const y0 = pad + ry;

    // Aplatissement des ellipses étroites : évite que la pointe du cône
    // (petit rayon horizontal) ne devienne une bille ronde. Les ellipses
    // larges (rx grand) ne sont pas affectées par ce min().
    const ELLIPSE_FLATNESS = 0.5;
    const capRy = (rx) => Math.min(ry, rx * ELLIPSE_FLATNESS);

    const valueFont = Math.max(10, Math.min(0.34 * stageHeight, 18 * (H / 650)));
    const pctFont   = Math.max(9,  Math.min(0.22 * stageHeight, 13 * (H / 650)));
    const labelFont = Math.max(8,  Math.min(0.26 * stageHeight, 14 * (H / 650)));

    // Zone des libellés : à GAUCHE du bord le plus large du cône
    const labelRight   = funnelCenterX - maxTopWidth - 0.03 * W;
    const labelLeft    = bannerLeftX + 0.02 * W;
    const labelCenterX = (labelLeft + labelRight) / 2;
    const maxTextW     = Math.max(60, labelRight - labelLeft);
    const maxChars     = Math.max(6, Math.floor(maxTextW / (0.58 * labelFont)));
    const lineH        = labelFont * 1.18;

    function wrapText(text, maxCh) {
      const words = String(text).split(/\s+/);
      const lines = [];
      let cur = "";
      for (let i = 0; i < words.length; i++) {
        const t = cur ? cur + " " + words[i] : words[i];
        if (t.length > maxCh && cur) { lines.push(cur); cur = words[i]; }
        else cur = t;
      }
      if (cur) lines.push(cur);
      return lines;
    }

    for (let i = totalStages - 1; i >= 0; i--) {
      const stage = stages[i];
      const stageColor = colors[i % colors.length];

      const topTaper = i / totalStages;
      const bottomTaper = (i + 1) / totalStages;
      const topRx = maxTopWidth - topTaper * (maxTopWidth - minBottomWidth);
      const bottomRx = maxTopWidth - bottomTaper * (maxTopWidth - minBottomWidth);

      // Rayons verticaux aplatis en fonction du rayon horizontal local
      const topRy = capRy(topRx);
      const bottomRy = capRy(bottomRx);

      const topY = y0 + i * stageHeight;
      const bottomY = y0 + (i + 1) * stageHeight;

      const g = document.createElementNS(SVGNS, "g");

      // Bande (fond du libellé) — s'étend vers la GAUCHE
      const banner = document.createElementNS(SVGNS, "polygon");
      banner.setAttribute("points",
        `${funnelCenterX},${topY} ${bannerLeftX},${topY} ${bannerLeftX},${bottomY} ${funnelCenterX},${bottomY}`);
      banner.setAttribute("fill", stageColor);
      banner.setAttribute("opacity", "0.95");
      g.appendChild(banner);

      // Trapèze conique (symétrique autour de funnelCenterX)
      const cone = document.createElementNS(SVGNS, "polygon");
      cone.setAttribute("points",
        `${funnelCenterX - topRx},${topY} ${funnelCenterX + topRx},${topY} ${funnelCenterX + bottomRx},${bottomY} ${funnelCenterX - bottomRx},${bottomY}`);
      cone.setAttribute("fill", stageColor);
      g.appendChild(cone);

      // Ellipse de base
      const be = document.createElementNS(SVGNS, "ellipse");
      be.setAttribute("cx", funnelCenterX); be.setAttribute("cy", bottomY);
      be.setAttribute("rx", bottomRx); be.setAttribute("ry", bottomRy);
      be.setAttribute("fill", stageColor); be.setAttribute("filter", "brightness(0.85)");
      g.appendChild(be);

      // Ellipse supérieure
      const te = document.createElementNS(SVGNS, "ellipse");
      te.setAttribute("cx", funnelCenterX); te.setAttribute("cy", topY);
      te.setAttribute("rx", topRx); te.setAttribute("ry", topRy);
      te.setAttribute("fill", stageColor); te.setAttribute("filter", "brightness(1.15)");
      g.appendChild(te);

      const midY = (topY + bottomY) / 2;

      // Pourcentage par rapport à l'étape précédente (juste au-dessus)
      const prevValue = i === 0 ? Number(stage.value) : Number(stages[i - 1].value) || 1;
      const pctRaw = i === 0 ? 100 : (Number(stage.value) / prevValue) * 100;
      const pctLabel = Math.round(pctRaw) + "%";

      // Valeur (centrée dans le cône, à droite)
      const textVal = document.createElementNS(SVGNS, "text");
      textVal.setAttribute("x", funnelCenterX);
      textVal.setAttribute("y", midY - valueFont * 0.45);
      textVal.setAttribute("class", "funnel-value-text");
      textVal.style.fontSize = valueFont + "px";
      textVal.textContent = Number(stage.value).toLocaleString().replace(/,/g, " ");
      g.appendChild(textVal);

      // Pourcentage (sous la valeur, dans le cône)
      const textPct = document.createElementNS(SVGNS, "text");
      textPct.setAttribute("x", funnelCenterX);
      textPct.setAttribute("y", midY + pctFont * 0.85);
      textPct.setAttribute("class", "funnel-value-text");
      textPct.style.fontSize = pctFont + "px";
      textPct.style.opacity = "0.85";
      textPct.textContent = pctLabel;
      g.appendChild(textPct);

      // Libellé multi-lignes, dans la zone gauche (jamais sur le cône)
      const lines = wrapText(displayLabel(stage), maxChars);
      const startY = midY - ((lines.length - 1) / 2) * lineH;
      for (let k = 0; k < lines.length; k++) {
        const tl = document.createElementNS(SVGNS, "text");
        tl.setAttribute("x", labelCenterX);
        tl.setAttribute("y", startY + k * lineH);
        tl.setAttribute("class", "funnel-label-text");
        tl.style.fontSize = labelFont + "px";
        tl.textContent = lines[k];
        g.appendChild(tl);
      }

      svg.appendChild(g);
    }
  }
});
