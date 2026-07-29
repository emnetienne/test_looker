looker.plugins.visualizations.add({
  id: "static_image",
  label: "Image statique",
  options: {
    imageUrl: {
      type: "string", label: "URL de l'image",
      default: "", section: "Image", order: 1,
      placeholder: "https://exemple.com/banniere.png"
    },
    altText: {
      type: "string", label: "Texte alternatif",
      default: "Image", section: "Image", order: 2
    },
    padding: {
      type: "number", label: "Marge intérieure (px)",
      default: 0, section: "Style", order: 1
    }
  },

  create: function (element, config) {
    element.innerHTML = `
      <style>
        .si-wrap { box-sizing: border-box; width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          overflow: hidden; background: transparent; }
        .si-img { max-width: 100%; max-height: 100%; width: auto; height: auto;
          object-fit: contain; display: block; }
        .si-empty { font-family: Arial, Helvetica, sans-serif; font-size: 13px;
          color: #6b6b6b; text-align: center; padding: 16px; }
      </style>
      <div class="si-wrap"><div class="si-content"></div></div>
    `;
    this._wrap = element.querySelector(".si-wrap");
    this._content = element.querySelector(".si-content");
  },

  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();

    var url = config.imageUrl || "";
    var alt = (config.altText != null && config.altText !== "") ? config.altText : "Image";
    var pad = (typeof config.padding === "number" && config.padding >= 0) ? config.padding : 0;

    this._wrap.style.padding = pad + "px";

    function esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    if (!url) {
      this._content.innerHTML = '<div class="si-empty">Renseignez l\'URL de l\'image dans les options de la visualisation.</div>';
      done();
      return;
    }

    this._content.innerHTML = '<img class="si-img" src="' + esc(url) + '" alt="' + esc(alt) + '" />';

    var img = this._content.querySelector(".si-img");
    var self = this;
    img.onerror = function () {
      self._content.innerHTML = '<div class="si-empty">Impossible de charger l\'image. Vérifiez l\'URL et qu\'elle est accessible publiquement (HTTPS, CORS).</div>';
    };

    done();
  }
});
