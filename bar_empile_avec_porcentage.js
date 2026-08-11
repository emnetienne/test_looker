/**
 * Répartition du CA avec % — Looker Custom Visualization
 * --------------------------------------------------------
 * API : Looker Visualization API (looker.plugins.visualizations.add)
 * Compatible LookML — à déposer comme fichier .js dans le projet Looker.
 *
 * Champs attendus dans l'Explore :
 *  - Option A : 1 dimension + 1 mesure (chaque valeur de la dimension = un segment)
 *  - Option B : 0 dimension + plusieurs mesures (chaque mesure = un segment)
 *    -> C'est ce mode qui est utilisé si aucune dimension n'est présente.
 */
looker.plugins.visualizations.add({
  id: "repartition_ca_pct",
  label: "Répartition CA avec %",
  options: {
    color_primary: {
      type: "string",
      label: "Couleur segment 1",
      display: "color",
      default: "#2E4FA3",
      section: "Style",
      order: 1
    },
    color_secondary: {
      type: "string",
      label: "Couleur segment 2",
      display: "color",
      default: "#FF6F59",
      section: "Style",
      order: 2
    }
  },
  // Appelé une seule fois, à la création du visuel
  create: function (element, config) {
    element.innerHTML =
      "<div class='repartition-ca-container' style='width:100%;height:100%;box-sizing:border-box;font-family:Roboto,Arial,sans-serif;overflow:hidden;'></div>";
    this._container = element.querySelector(".repartition-ca-container");
  },
  // Appelé à chaque mise à jour des données / du style
  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();
    var dimensions = queryResponse.fields.dimension_like;
    var measures = queryResponse.fields.measure_like;
    var segments = [];
    if (dimensions.length && measures.length) {
      // --- Mode A : 1 dimension + 1 mesure ---
      var dimName = dimensions[0].name;
      var measureName = measures[0].name;
      segments = data.map(function (row) {
        return {
          label: LookerCharts.Utils.textForCell(row[dimName]),
          value: (row[measureName] && row[measureName].value) || 0
        };
      });
    } else if (measures.length >= 1 && data.length) {
      // --- Mode B : pas de dimension, plusieurs mesures ---
      // Chaque mesure devient un segment ; on prend la première ligne
      // (les mesures sont déjà agrégées par l'Explore).
      var row0 = data[0];
      segments = measures.map(function (m) {
        return {
          label: m.label_short || m.label || m.name,
          value: (row0[m.name] && row0[m.name].value) || 0
        };
      });
    } else {
      this.addError({
        title: "Champs manquants",
        message: "Cette visualisation nécessite soit (1 dimension + 1 mesure), soit (plusieurs mesures sans dimension)."
      });
      return;
    }
    // Force l'ordre : "Incrémental" toujours en haut, "Naturel" toujours en bas.
    // Les autres segments éventuels gardent leur ordre d'origine, insérés entre les deux.
    function rank(label) {
      var l = (label || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, ""); // enlève les accents (é -> e)
      if (l.indexOf("increment") !== -1) return 0;
      if (l.indexOf("naturel") !== -1 || l.indexOf("natural") !== -1) return 2;
      return 1;
    }
    segments = segments
      .map(function (seg, idx) { return { seg: seg, idx: idx, rank: rank(seg.label) }; })
      .sort(function (a, b) { return a.rank - b.rank || a.idx - b.idx; })
      .map(function (x) { return x.seg; });

    var total = segments.reduce(function (sum, s) { return sum + s.value; }, 0);
    var palette = [
      config.color_primary || "#2E4FA3",
      config.color_secondary || "#FF6F59",
      "#34A853", "#FBBC04", "#9C27B0", "#00ACC1"
    ];
    var euroFormatter = new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0
    });
    var pctFormatter = new Intl.NumberFormat("fr-FR", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    });

    // Hauteur minimale nécessaire pour que le texte (montant + %) ne soit
    // jamais coupé, quelle que soit la petitesse du segment en proportion.
    var MIN_SEGMENT_HEIGHT = 92; // px : 32px (montant) + 4px marge + 22px (%) + paddings

    var containerHeight = this._container.clientHeight || element.clientHeight || 400;

    var html =
      "<div style='display:flex;flex-direction:column;border-radius:6px;height:100%;min-height:" +
      (segments.length * MIN_SEGMENT_HEIGHT) + "px;'>";
    segments.forEach(function (seg, i) {
      var pct = total > 0 ? seg.value / total : 0;
      var flexGrow = Math.max(pct * 100, 4);
      html +=
        "<div style='flex:" + flexGrow + " 1 0;background-color:" + palette[i % palette.length] +
        ";display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:32px;min-height:" +
        MIN_SEGMENT_HEIGHT + "px;text-align:center;padding:8px 4px;box-sizing:border-box;'>" +
        "<div style='line-height:1.1;'>" + euroFormatter.format(seg.value) + "</div>" +
        "<div style='font-size:22px;font-weight:500;opacity:0.9;margin-top:4px;line-height:1.1;'>" + pctFormatter.format(pct) + "</div>" +
        "</div>";
    });
    html += "</div>";

    // Si la hauteur totale nécessaire dépasse l'espace du tile Looker,
    // on laisse le conteneur scroller plutôt que de couper le texte.
    this._container.style.overflowY =
      segments.length * MIN_SEGMENT_HEIGHT > containerHeight ? "auto" : "hidden";

    this._container.innerHTML = html;
    done();
  }
});
