
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
    console.log("eccomi")
    const data=[{anno:"1990",numero:1700},{anno:"2017",numero:3400},{anno:"2020",numero:3958}]
    var margin = {top: 20, right: 30, bottom: 40, left: 90},
    width = 460 - margin.left - margin.right,
    height = 400 - margin.top - margin.bottom;
    const svg = d3.select("#barDevotoOli").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform",
          "translate(" + margin.left + "," + margin.top + ")");

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
    .attr("height", 80 )
    .style("margin-top", "40px")
    .attr("fill", "white")
  }

  function addNeologismi(){
    var width = 400
    height = 400
    margin = 10

// The radius of the pieplot is half the width or half the height (smallest one). I subtract a bit of margin.
var radius = Math.min(width, height) / 2 - margin

// append the svg object to the div called 'donutNeologismi'
var svg = d3.select("#donutNeologismi")
  .append("svg")
    .attr("width", width)
    .attr("height", height)
  .append("g")
    .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")");

// Create dummy data
var data = {crudi:51.7,altro:48.3}

// set the color scale
var color = d3.scaleOrdinal()
  .domain(data)
  .range(["white","grey" ])

// Compute the position of each group on the pie:
var pie = d3.pie()
  .value(function(d) {return d.value; })
var data_ready = pie(d3.entries(data))

// Build the pie chart: Basically, each part of the pie is a path that we build using the arc function.
svg
  .selectAll('whatever')
  .data(data_ready)
  .enter()
  .append('path')
  .attr('d', d3.arc()
    .innerRadius(100)         // This is the size of the donut hole
    .outerRadius(radius)
  )
  .attr('fill', function(d){ return(color(d.data.key)) })
  .attr("stroke", "black")
  .style("stroke-width", "2px")
  .style("opacity", 0.7)

  }