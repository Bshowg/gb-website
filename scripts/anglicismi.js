

/// JS per la pagina anglicismi.html deve avere lo stesso nome del file html!!!!!
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", (event) => {
        barAnglicismi();
        addNeologismi();
    });
} else {
    // DOMContentLoaded has already fired
    barAnglicismi();
    addNeologismi();
}


  function barAnglicismi(){
    const data=[{anno:"1990",numero:1700},{anno:"2017",numero:3400},{anno:"2020",numero:3958}]
    const parentWidth = d3.select('#barDevotoOli').node().clientWidth;
    const margin = {top: 50, right: 10, bottom: 50, left: 50};
    const width = parentWidth - margin.left - margin.right,
          height = Math.min(width, 400) - margin.top - margin.bottom;
    const barHeight = height / data.length - 10; // Subtracts 10 for spacing between bars
    const svg = d3.select("#barDevotoOli").append("svg")
        .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

      // Add X axis
      var x = d3.scaleLinear()
      .domain([0, d3.max(data, function(d) { return d.numero; })])
      .range([0, width])
      
svg.append("g")
  .attr("transform", "translate(0," + height + ")")
  .call(d3.axisBottom(x))
  .selectAll("text")
    .attr("transform", "translate(-10,0)rotate(-45)")
    .style("text-anchor", "end");

// Y axis
var y = d3.scaleBand()
  .range([ 0, height ])
  .domain(data.map(function(d) { return d.anno; }))

svg.append("g")
  .call(d3.axisLeft(y))

  svg.selectAll("myRect")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", x(0) )
    .attr("y", function(d) { return y(d.anno); })
    .attr("width", function(d) { return x(d.numero); })
    .attr("height", barHeight )
    .style("margin-top", "40px")
    .attr("fill", "white")

    svg.append("text")
    .attr("x", width / 2)
    .attr("y", 0 - (margin.top / 2))
    .attr("text-anchor", "middle")
    .style("font-size", "16px")
    .attr("fill", "white")  // Changed from "color" to "fill"
    .text("Numero di anglicismi nel Devoto Oli per anno");
  }

  function addNeologismi(){
    var data = {crudi:51.7,altro:48.3}
    const parentWidth = d3.select('#donutNeologismi').node().clientWidth;
    const margin = 50;
    const width = parentWidth,
          height = Math.min(width+margin, 460);
    const radius = (Math.min(width, height) / 2) - margin;

    const svg = d3.select("#donutNeologismi").append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .append("g")
        .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

// Create dummy data
var data = {crudi:51.7,altro:48.3}

// set the color scale
var color = d3.scaleOrdinal()
  .range(["#fff","#666"])

// Compute the position of each group on the pie:
const pie = d3.pie()
  .value(d=>d[1])

const data_ready = pie(Object.entries(data))

// Build the pie chart: Basically, each part of the pie is a path that we build using the arc function.
svg
  .selectAll('whatever')
  .data(data_ready)
  .join('path')
  .attr('d', d3.arc()
    .innerRadius(width/3)         // This is the size of the donut hole
    .outerRadius(radius)
  )
  .attr('fill', d => color(d.data[0]))
  .attr("stroke", "white")
  .style("stroke-width", "2px")
  .style("opacity", 0.7)

   // Add a title
   svg.append("text")
   .attr("text-anchor", "middle")
   .attr("y", -radius - 20)
   .style("font-size", "16px")
   
   .style("fill","white")
   .text("Distribuzione dei neologismi in italiano");

 // Add a legend
 const legend_labels=["Direttamente in inglese","Altro"]
 var legend = svg.append("g")
   .attr("transform", "translate(" + (-radius) + "," + (radius + 30) + ")");

 Object.entries(data).forEach(([key, value], index) => {
     var legendRow = legend.append("g")
         .attr("transform", "translate(0, " + (index * 20) + ")");

     legendRow.append("rect")
         .attr("width", 10)
         .attr("height", 10)
         .attr("fill", color(key));

     legendRow.append("text")
         .attr("x", 20)
         .attr("y", 10)
         .attr("text-anchor", "start")
         .style("text-transform", "capitalize")
         .style("fill","white")
         .text(legend_labels[index]);
 });
  }