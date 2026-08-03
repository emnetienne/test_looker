/**
 * ============================================================================
 *  Références animées — Visualisation custom Looker (API "classique")
 * ----------------------------------------------------------------------------
 *  Affiche une dimension (ex. "Product Name") sous forme de liste
 *  multi-colonnes qui s'adapte AUTOMATIQUEMENT :
 *    - au nombre de produits (les colonnes se remplissent toutes seules)
 *    - à la largeur de la tuile (nombre de colonnes recalculé par le CSS)
 *
 *  Design repris des slides 2 & 3 du PPT :
 *    - Fond crème        #EEEAE2
 *    - Carte blanche arrondie + ombre douce
 *    - Titre bleu marine  #1F2D4D  (typo géométrique type Poppins)
 *    - Accents            bleu #3D50B5 / corail #EC6A4E / magenta #A83A6C
 *
 *  Conçue pour s'insérer comme UN élément d'un slide, pas tout le slide.
 * ============================================================================
 */

looker.plugins.visualizations.add({
  id: "refs_animees",
  label: "Références animées",

  /* ----------------------------------------------------------------------- */
  /*  Options exposées dans le panneau de configuration Looker               */
  /* ----------------------------------------------------------------------- */
  options: {
    show_index: {
      section: "Style",
      type: "boolean",
      label: "Afficher la numérotation",
      default: true,
      order: 3
    },
    card_style: {
      section: "Style",
      type: "string",
      label: "Fond",
      display: "select",
      values: [
        { "Carte blanche": "card" },
        { "Transparent (sur fond crème du slide)": "flat" }
      ],
      default: "card",
      order: 4
    },
    min_col_width: {
      section: "Mise en page",
      type: "number",
      label: "Largeur minimale d'une colonne (px)",
      default: 240,
      order: 1
    },
    density: {
      section: "Mise en page",
      type: "string",
      label: "Densité",
      display: "select",
      values: [
        { "Confortable": "comfy" },
        { "Compacte": "compact" }
      ],
      default: "comfy",
      order: 2
    }
  },

  /* ----------------------------------------------------------------------- */
  /*  create : appelé une seule fois — on injecte le style + le conteneur     */
  /* ----------------------------------------------------------------------- */
  create: function (element, config) {
    element.innerHTML = "";

    var style = document.createElement("style");
    style.innerHTML = `
      @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

      .ra-root {
        --cream:      #EEEAE2;
        --ink:        #1F2D4D;
        --ink-soft:   #2C3A57;
        --blue:       #3D50B5;
        --coral:      #EC6A4E;
        --magenta:    #A83A6C;
        --divider:    #ECE9E2;

        box-sizing: border-box;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: 10px;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
        color: var(--ink-soft);
        -webkit-font-smoothing: antialiased;
      }
      .ra-root *, .ra-root *::before, .ra-root *::after { box-sizing: border-box; }

      /* ---- Carte principale ------------------------------------------- */
      .ra-card {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        border-radius: 24px;
        padding: 26px 30px 20px 30px;
        overflow: hidden;
      }
      .ra-card.style-card {
        background: #FFFFFF;
        box-shadow: 0 12px 34px rgba(31, 45, 77, 0.10);
      }
      .ra-card.style-flat {
        background: transparent;
        box-shadow: none;
        padding: 8px 10px;
      }

      /* ---- Liste multi-colonnes (responsive automatique) -------------- */
      .ra-list {
        flex: 1 1 auto;
        min-height: 0;
        overflow: auto;
        column-gap: 34px;
        /* column-width piloté par min_col_width -> inline style */
      }
      .ra-item {
        display: flex;
        align-items: baseline;
        gap: 12px;
        padding: 11px 2px;
        border-bottom: 1px solid var(--divider);
        break-inside: avoid;
        -webkit-column-break-inside: avoid;
        page-break-inside: avoid;
      }
      .ra-root.dens-compact .ra-item { padding: 6px 2px; }

      .ra-index {
        flex: 0 0 auto;
        min-width: 26px;
        height: 22px;
        padding: 0 7px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: 'Poppins', 'Inter', sans-serif;
        font-weight: 600;
        font-size: 11.5px;
        color: var(--blue);
        background: rgba(61, 80, 181, 0.10);
        border-radius: 7px;
      }
      .ra-name {
        font-size: 15px;
        line-height: 1.35;
        color: var(--ink-soft);
        word-break: break-word;
      }
      .ra-root.dens-compact .ra-name { font-size: 13.5px; }

      /* ---- États vides / erreurs -------------------------------------- */
      .ra-empty {
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #93A0B8;
        font-size: 14px;
        text-align: center;
      }

      /* Barre scroll discrète */
      .ra-list::-webkit-scrollbar { width: 8px; height: 8px; }
      .ra-list::-webkit-scrollbar-thumb { background: rgba(31,45,77,0.15); border-radius: 8px; }
    `;
    element.appendChild(style);

    this._root = document.createElement("div");
    this._root.className = "ra-root";
    element.appendChild(this._root);
  },

  /* ----------------------------------------------------------------------- */
  /*  updateAsync : appelé à chaque rafraîchissement de données               */
  /* ----------------------------------------------------------------------- */
  updateAsync: function (data, element, config, queryResponse, details, done) {
    this.clearErrors();

    var root = this._root;

    // -- Récupération du champ à afficher (1re dimension, sinon 1re mesure) --
    var fields = queryResponse.fields;
    var candidates = []
      .concat(fields.dimensions || [])
      .concat(fields.measures || []);

    if (!candidates.length) {
      this.addError({
        title: "Aucun champ",
        message: "Ajoutez au moins une dimension (ex. le nom de produit)."
      });
      done();
      return;
    }

    var fieldName = candidates[0].name;

    // -- Extraction + nettoyage des valeurs --------------------------------
    var values = data
      .map(function (row) {
        var cell = row[fieldName];
        if (!cell) return "";
        return cell.value != null ? cell.value : (cell.rendered || "");
      })
      .filter(function (v) {
        return v !== null && v !== undefined && String(v).trim() !== "";
      });

    // -- Application des classes de densité --------------------------------
    root.className = "ra-root" + (config.density === "compact" ? " dens-compact" : "");

    // -- Construction du HTML ---------------------------------------------
    var isCard = config.card_style !== "flat";
    var showIndex = config.show_index !== false;
    var colW = Number(config.min_col_width) > 0 ? Number(config.min_col_width) : 240;

    var body;
    if (!values.length) {
      body = '<div class="ra-empty">Aucune référence à afficher</div>';
    } else {
      var items = values
        .map(function (v, i) {
          return (
            '<div class="ra-item">' +
              (showIndex ? '<span class="ra-index">' + (i + 1) + "</span>" : "") +
              '<span class="ra-name">' + escapeHtml(String(v)) + "</span>" +
            "</div>"
          );
        })
        .join("");
      body =
        '<div class="ra-list" style="column-width:' + colW + 'px;">' +
          items +
        "</div>";
    }

    root.innerHTML =
      '<div class="ra-card ' + (isCard ? "style-card" : "style-flat") + '">' +
        body +
      "</div>";

    done();
  }
});

/* --------------------------------------------------------------------------- */
/*  Utilitaire : échappement HTML (sécurité + rendu correct des libellés)       */
/* --------------------------------------------------------------------------- */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
