const geoDataURL = "https://enjalot.github.io/wwsd/data/world/world-110m.geojson";

const svg = d3.select("#map"),
    width = +svg.style("width").replace("px", ""),
    height = +svg.style("height").replace("px", "");

const projection = d3.geoNaturalEarth1()
    .scale(width / 2 / Math.PI)
    .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

svg.append("path")
   .attr("class", "sphere")
   .attr("d", path({type: "Sphere"}));

d3.json(geoDataURL).then(data => {
    svg.selectAll("path")
       .data(data.features)
       .enter().append("path")
       .attr("fill", "#ccc")
       .attr("d", path)
       .append("title") // Tooltips
       .text(d => d.properties.name);
});