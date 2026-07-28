looker.plugins.visualizations.add({
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
          text-anchor: end;
          dominant-baseline: central;
        }
      </style>
      <div class="funnel-container">
        <svg class="funnel-svg" id="funnelSvg"></svg>
      </div>
    `;

    this._element = element;
    this._svg = element.querySelector("#funnelSvg");

    // --- RESPONSIVE : re-render dès que la tuile change de taille ---------
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
      this.addError({
        title: "No Data",
        message: "This visualization requires data rows or measures."
      });
      return;
    }

    // ==================================================================
    //  RENOMMAGE CIBLÉ DES LIBELLÉS
    //  On matche sur le NOM TECHNIQUE du champ (field.name, texte propre)
    //  ET/OU sur le libellé. Si le contenu normalisé contient TOUS les
    //  mots-clés d'une règle -> on affiche `to`. Les autres restent tels quels.
    // ==================================================================
    const RENAME_RULES = [
      { keywords: ["trad"], to: "Nombre de client acheteurs de produits animés" }
    ];

    const norm = (s) => (s == null ? "" : String(s))
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    const displayLabel = (stage) => {
      const hay = norm((stage.key || "") + " " + (stage.label || ""));
      for (const r of RENAME_RULES) {
        if (r.keywords.every((k) => hay.includes(norm(k)))) return r.to;
      }
      return stage.label;
    };

    let stages = [];

    // Formater les données (on conserve `key` = nom technique du champ)
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
        return {
          key: lbl,
          label: lbl,
          value: measureKey ? row[measureKey]?.value : 0
        };
      });
    }

    // Diagnostic : ouvre la console (F12) si un renommage ne se déclenche pas.
    try {
      console.log("[funnel] champs reçus:", stages.map((s) => ({ key: s.key, label: s.label })));
    } catch (e) {}

    // On mémorise l'état pour pouvoir re-render au redimensionnement
    this._stages = stages;
    this._config = config;
    this._displayLabel = displayLabel;

    this._draw();
    done();
  },

  /* ------------------------------------------------------------------------ */
  /*  Dessin proportionnel — remplit la tuile en HAUTEUR ET en LARGEUR         */
  /*  Appelé par updateAsync ET par le ResizeObserver                          */
  /* ------------------------------------------------------------------------ */
  _draw: function () {
    const stages = this._stages || [];
    const config = this._config || {};
    const displayLabel = this._displayLabel || ((s) => s.label);
    const element = this._element;
    const svg = this._svg;
    if (!svg || !stages.length) return;

    svg.innerHTML = "";

    const totalStages = stages.length;
    if (totalStages === 0) return;

    // --- Taille réelle de la tuile (pixels) ------------------------------
    const W = element.clientWidth || 1000;
    const H = element.clientHeight || 650;
    if (W < 20 || H < 20) return;

    // Le viewBox = pixels exacts -> aucune bande vide, on remplit tout.
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const defaultColors = ["#5D8EC2", "#2B5278", "#4A154B", "#6B0D38", "#3B1E08"];
    const colors = config.stageColors && config.stageColors.length > 0 ? config.stageColors : defaultColors;

    // --- Géométrie EN PROPORTION de la tuile -----------------------------
    // (mêmes ratios que le design d'origine 1000x650)
    const funnelCenterX  = 0.32 * W;   // centre horizontal de l'entonnoir
    const maxTopWidth    = 0.26 * W;   // demi-largeur du haut
    const minBottomWidth = 0.06 * W;   // demi-largeur du bas
    const bannerRightX   = 0.98 * W;   // fin de la bande de texte à droite
    const labelPad       = 0.025 * W;  // marge droite du libellé

    const stageHeight = H / (totalStages + 0.3);         // hauteur par segment
    const ry = Math.min(0.034 * H, stageHeight * 0.4);   // perspective 3D (ellipse)

    // Tailles de texte proportionnelles à la hauteur
    const valueFont = Math.max(11, 20 * (H / 650));
    const labelFont = Math.max(9, 16 * (H / 650));

    // Dessiner de bas en haut pour un chevauchement 3D parfait
    for (let i = totalStages - 1; i >= 0; i--) {
      const stage = stages[i];
      const stageColor = colors[i % colors.length];

      // Tapering (réduction progressive de la largeur)
      const topTaper = i / totalStages;
      const bottomTaper = (i + 1) / totalStages;

      const topRx = maxTopWidth - topTaper * (maxTopWidth - minBottomWidth);
      const bottomRx = maxTopWidth - bottomTaper * (maxTopWidth - minBottomWidth);

      const topY = i * stageHeight + ry;
      const bottomY = (i + 1) * stageHeight + ry;

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

      // Bande rectangulaire à droite (arrière-plan du libellé)
      const banner = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const bannerPoints = `${funnelCenterX},${topY} ${bannerRightX},${topY} ${bannerRightX},${bottomY} ${funnelCenterX},${bottomY}`;
      banner.setAttribute("points", bannerPoints);
      banner.setAttribute("fill", stageColor);
      banner.setAttribute("opacity", "0.95");
      g.appendChild(banner);

      // Trapeze principal (corps du segment conique)
      const cone = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const conePoints = `${funnelCenterX - topRx},${topY} ${funnelCenterX + topRx},${topY} ${funnelCenterX + bottomRx},${bottomY} ${funnelCenterX - bottomRx},${bottomY}`;
      cone.setAttribute("points", conePoints);
      cone.setAttribute("fill", stageColor);
      g.appendChild(cone);

      // Ellipse de base (bas du segment)
      const bottomEllipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      bottomEllipse.setAttribute("cx", funnelCenterX);
      bottomEllipse.setAttribute("cy", bottomY);
      bottomEllipse.setAttribute("rx", bottomRx);
      bottomEllipse.setAttribute("ry", ry);
      bottomEllipse.setAttribute("fill", stageColor);
      bottomEllipse.setAttribute("filter", "brightness(0.85)");
      g.appendChild(bottomEllipse);

      // Ellipse supérieure (ouverture 3D)
      const topEllipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      topEllipse.setAttribute("cx", funnelCenterX);
      topEllipse.setAttribute("cy", topY);
      topEllipse.setAttribute("rx", topRx);
      topEllipse.setAttribute("ry", ry);
      topEllipse.setAttribute("fill", stageColor);
      topEllipse.setAttribute("filter", "brightness(1.15)");
      g.appendChild(topEllipse);

      // Texte de la valeur (centré dans le funnel)
      const midY = (topY + bottomY) / 2;
      const textVal = document.createElementNS("http://www.w3.org/2000/svg", "text");
      textVal.setAttribute("x", funnelCenterX);
      textVal.setAttribute("y", midY);
      textVal.setAttribute("class", "funnel-value-text");
      textVal.style.fontSize = valueFont + "px";
      textVal.textContent = Number(stage.value).toLocaleString();
      g.appendChild(textVal);

      // Texte du libellé (aligné sur la bande à droite) — avec renommage ciblé
      const textLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      textLabel.setAttribute("x", bannerRightX - labelPad);
      textLabel.setAttribute("y", midY);
      textLabel.setAttribute("class", "funnel-label-text");
      textLabel.style.fontSize = labelFont + "px";
      textLabel.textContent = displayLabel(stage);
      g.appendChild(textLabel);

      svg.appendChild(g);
    }
  }
});
