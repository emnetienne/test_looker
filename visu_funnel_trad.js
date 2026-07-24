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
          font-size: 20px;
          font-weight: bold;
          fill: #ffffff;
          text-anchor: middle;
          dominant-baseline: central;
        }
        .funnel-label-text {
          font-size: 16px;
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

    const svg = element.querySelector("#funnelSvg");
    svg.innerHTML = ""; // Vider le SVG avant d'afficher les nouvelles données

    let stages = [];

    // Formater les données
    if (data.length === 1 && queryResponse.fields.measure_like.length > 1) {
      const row = data[0];
      queryResponse.fields.measure_like.forEach((field) => {
        stages.push({
          label: field.label_short || field.label,
          value: row[field.name]?.value || 0
        });
      });
    } else {
      const dimKey = queryResponse.fields.dimension_like[0]?.name;
      const measureKey = queryResponse.fields.measure_like[0]?.name;

      stages = data.map((row) => ({
        label: dimKey ? row[dimKey]?.value : "Stage",
        value: measureKey ? row[measureKey]?.value : 0
      }));
    }

    const totalStages = stages.length;
    if (totalStages === 0) return;

    // Dimensions de cadrage virtuel pour le responsive
    const width = 1000;
    const height = 650;

    // Redimensionnement dynamique fluide (conserve les proportions et s'adapte à la tuile)
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const defaultColors = ["#5D8EC2", "#2B5278", "#4A154B", "#6B0D38", "#3B1E08"];
    const colors = config.stageColors && config.stageColors.length > 0 ? config.stageColors : defaultColors;

    // Définition de l'espace pour le funnel et les bandes latérales
    const funnelCenterX = 320;
    const maxTopWidth = 260; // Demi-largeur du haut de l'entonnoir
    const minBottomWidth = 60; // Demi-largeur du bas
    const bannerRightX = 960;  // Fin de la bande de texte à droite
    const stageHeight = height / (totalStages + 0.3); // Hauteur par segment
    const ry = 22; // Rayon vertical pour la perspective 3D (ellipse)

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

      // 1. Groupe pour chaque segment
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

      // 2. Bande rectangulaire à droite (arrière-plan du libellé)
      const banner = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const bannerPoints = `${funnelCenterX},${topY} ${bannerRightX},${topY} ${bannerRightX},${bottomY} ${funnelCenterX},${bottomY}`;
      banner.setAttribute("points", bannerPoints);
      banner.setAttribute("fill", stageColor);
      banner.setAttribute("opacity", "0.95");
      g.appendChild(banner);

      // 3. Trapeze principal (Corps du segment conique)
      const cone = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      const conePoints = `${funnelCenterX - topRx},${topY} ${funnelCenterX + topRx},${topY} ${funnelCenterX + bottomRx},${bottomY} ${funnelCenterX - bottomRx},${bottomY}`;
      cone.setAttribute("points", conePoints);
      cone.setAttribute("fill", stageColor);
      g.appendChild(cone);

      // 4. Ellipse de base (Ombre/Bas du segment)
      const bottomEllipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      bottomEllipse.setAttribute("cx", funnelCenterX);
      bottomEllipse.setAttribute("cy", bottomY);
      bottomEllipse.setAttribute("rx", bottomRx);
      bottomEllipse.setAttribute("ry", ry);
      bottomEllipse.setAttribute("fill", stageColor);
      bottomEllipse.setAttribute("filter", "brightness(0.85)"); // Légèrement plus sombre pour le relief 3D
      g.appendChild(bottomEllipse);

      // 5. Ellipse supérieure (Ouverture 3D)
      const topEllipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
      topEllipse.setAttribute("cx", funnelCenterX);
      topEllipse.setAttribute("cy", topY);
      topEllipse.setAttribute("rx", topRx);
      topEllipse.setAttribute("ry", ry);
      topEllipse.setAttribute("fill", stageColor);
      topEllipse.setAttribute("filter", "brightness(1.15)"); // Légèrement plus clair
      g.appendChild(topEllipse);

      // 6. Texte de la valeur (Centré À L'INTÉRIEUR du funnel)
      const textVal = document.createElementNS("http://www.w3.org/2000/svg", "text");
      const midY = (topY + bottomY) / 2;
      textVal.setAttribute("x", funnelCenterX);
      textVal.setAttribute("y", midY);
      textVal.setAttribute("class", "funnel-value-text");
      textVal.textContent = Number(stage.value).toLocaleString();
      g.appendChild(textVal);

      // 7. Texte du Libellé (Aligné sur la bande à droite)
      const textLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
      textLabel.setAttribute("x", bannerRightX - 25);
      textLabel.setAttribute("y", midY);
      textLabel.setAttribute("class", "funnel-label-text");
      textLabel.textContent = stage.label;
      g.appendChild(textLabel);

      svg.appendChild(g);
    }

    done();
  }
});
