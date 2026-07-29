looker.plugins.visualizations.add({
  id: "info_box",
  label: "Encadré info",
  options: {
    symbol: {
      type: "string", label: "Symbole",
      default: "?", section: "Contenu", order: 1,
      placeholder: "? ou tout autre caractère"
    },
    title: {
      type: "string", label: "Titre",
      default: "Impressions :", section: "Contenu", order: 2
    },
    body: {
      type: "string", label: "Texte",
      default: "Nombre d'affichages de l'opération sur l'application, le site et l'application Intermarché Drive.",
      section: "Contenu", order: 3
    },
    tileColor: {
      type: "string", display: "color", label: "Couleur de la tuile",
      default: "#3f51a8", section: "Couleurs", order: 1
    },
    textColor: {
      type: "string", display: "color", label: "Couleur du texte",
      default: "#ffffff", section: "Couleurs", order: 2
    },
    symbolColor: {
      type: "string", display: "color", label: "Couleur du symbole",
      default: "#ffffff", section: "Couleurs", order: 3
    },
    borderRadius: {
      type: "number", label: "Arrondi des coins (px)",
      default: 12, section: "Style", order: 1
    },
    titleSize: {
      type: "number", label: "Taille du titre (px)",
      default: 16, section: "Style", order: 2
    },
    bodySize: {
      type: "number", label: "Taille du texte (px)",
      default: 14, section: "Style", order: 3
    },
    symbolSize: {
      type: "number", label: "Taille du symbole (px)",
      default: 22, section: "Style", order: 4
    }
  },

  create: function (element, config) {
    element.innerHTML = `
      <style>
        .ib-wrap { box-sizing: border-box; width: 100%; height: 100%; overflow: hidden;
          font-family: Arial, Helvetica, sans-serif; }
        .ib-symbol { line-height: 1; margin-bottom: 12px; }
        .ib-title { font-weight: bold; margin-bottom: 8px; }
        .ib-body { line-height: 1.5; }
      </style>
      <div class="ib-wrap">
        <div class="ib-symbol"></div>
        <div class="ib-title"></div>
        <div class="ib-body"></div>
      </div>
    `;
    this._wrap = element.querySelector(".ib-wrap");
    this._symbol = element.querySelector(".ib-symbol");
    this._title = element.querySelector(".ib-title");
    this._body = element.querySelector(".ib-body");
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();

    function esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function num(v, d) { return (typeof v === "number" && v >= 0) ? v : d; }

    var tileColor = config.tileColor || "#3f51a8";
    var textColor = config.textColor || "#ffffff";
    var symbolColor = config.symbolColor || "#ffffff";
    var radius = num(config.borderRadius, 12);
    var titleSize = num(config.titleSize, 16);
    var bodySize = num(config.bodySize, 14);
    var symbolSize = num(config.symbolSize, 22);

    this._wrap.style.background = tileColor;
    this._wrap.style.borderRadius = radius + "px";
    this._wrap.style.color = textColor;
    this._wrap.style.padding = "20px 24px";

    this._symbol.style.color = symbolColor;
    this._symbol.style.fontSize = symbolSize + "px";
    this._symbol.textContent = (config.symbol != null && config.symbol !== "") ? config.symbol : "?";

    this._title.style.fontSize = titleSize + "px";
    this._title.textContent = config.title || "";
    this._title.style.display = this._title.textContent ? "block" : "none";

    this._body.style.fontSize = bodySize + "px";
    this._body.textContent = config.body || "";

    done();
  }
});
