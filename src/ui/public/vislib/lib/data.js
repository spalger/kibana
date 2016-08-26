import d3 from 'd3';
import _ from 'lodash';
import VislibComponentsZeroInjectionInjectZerosProvider from 'ui/vislib/components/zero_injection/inject_zeros';
import VislibComponentsZeroInjectionOrderedXKeysProvider from 'ui/vislib/components/zero_injection/ordered_x_keys';
import VislibComponentsLabelsLabelsProvider from 'ui/vislib/components/labels/labels';
import VislibComponentsColorColorProvider from 'ui/vislib/components/color/color';
export default function DataFactory(Private) {

  const injectZeros = Private(VislibComponentsZeroInjectionInjectZerosProvider);
  const orderKeys = Private(VislibComponentsZeroInjectionOrderedXKeysProvider);
  const getLabels = Private(VislibComponentsLabelsLabelsProvider);
  const color = Private(VislibComponentsColorColorProvider);

  /**
   * Provides an API for pulling values off the data
   * and calculating values using the data
   *
   * @class Data
   * @constructor
   * @param data {Object} Elasticsearch query results
   * @param attr {Object|*} Visualization options
   */
  function Data(data, attr, uiState) {
    if (!(this instanceof Data)) {
      return new Data(data, attr, uiState);
    }

    this.uiState = uiState;

    const self = this;
    let offset;

    if (attr.mode === 'stacked') {
      offset = 'zero';
    } else if (attr.mode === 'percentage') {
      offset = 'expand';
    } else if (attr.mode === 'grouped') {
      offset = 'group';
    } else {
      offset = attr.mode;
    }

    this.data = data;
    this.type = this.getDataType();

    this.labels = this._getLabels(this.data);
    this.color = this.labels ? color(this.labels, uiState.get('vis.colors')) : undefined;
    this._normalizeOrdered();

    this._attr = _.defaults(attr || {}, {
      stack: d3.layout.stack()
        .x(function (d) { return d.x; })
        .y(function (d) {
          if (offset === 'expand') {
            return Math.abs(d.y);
          }
          return d.y;
        })
        .offset(offset || 'zero')
    });

    if (attr.mode === 'stacked' && attr.type === 'histogram') {
      this._attr.stack.out(function (d, y0, y) {
        return self._stackNegAndPosVals(d, y0, y);
      });
    }
  }

  Data.prototype._updateData = function () {
    if (this.data.rows) {
      _.map(this.data.rows, this._updateDataSeriesLabel, this);
    } else if (this.data.columns) {
      _.map(this.data.columns, this._updateDataSeriesLabel, this);
    } else {
      this._updateDataSeriesLabel(this.data);
    }
  };

  Data.prototype._updateDataSeriesLabel = function (eachData) {
    if (eachData.series) {
      eachData.series[0].label = this.get('yAxisLabel');
    }
  };

  Data.prototype._getLabels = function (data) {
    if (this.type === 'series') {
      const noLabel = getLabels(data).length === 1 && getLabels(data)[0] === '';
      if (noLabel) {
        this._updateData();
        return [(this.get('yAxisLabel'))];
      }
      return getLabels(data);
    }
    return this.pieNames();
  };

  /**
   * Returns true for positive numbers
   */
  Data.prototype._isPositive = function (num) {
    return num >= 0;
  };

  /**
   * Returns true for negative numbers
   */
  Data.prototype._isNegative = function (num) {
    return num < 0;
  };

  /**
   * Adds two input values
   */
  Data.prototype._addVals = function (a, b) {
    return a + b;
  };

  /**
   * Returns the results of the addition of numbers in a filtered array.
   */
  Data.prototype._sumYs = function (arr, callback) {
    const filteredArray = arr.filter(callback);

    return (filteredArray.length) ? filteredArray.reduce(this._addVals) : 0;
  };

  /**
   * Calculates the d.y0 value for stacked data in D3.
   */
  Data.prototype._calcYZero = function (y, arr) {
    if (y >= 0) return this._sumYs(arr, this._isPositive);
    return this._sumYs(arr, this._isNegative);
  };

  /**
   *
   */
  Data.prototype._getCounts = function (i, j) {
    const data = this.chartData();
    const dataLengths = {};

    dataLengths.charts = data.length;
    dataLengths.stacks = dataLengths.charts ? data[i].series.length : 0;
    dataLengths.values = dataLengths.stacks ? data[i].series[j].values.length : 0;

    return dataLengths;
  };

  /**
   *
   */
  Data.prototype._createCache = function () {
    const cache = {
      index: {
        chart: 0,
        stack: 0,
        value: 0
      },
      yValsArr: []
    };

    cache.count = this._getCounts(cache.index.chart, cache.index.stack);

    return cache;
  };

  /**
   * Stacking function passed to the D3 Stack Layout `.out` API.
   * See: https://github.com/mbostock/d3/wiki/Stack-Layout
   * It is responsible for calculating the correct d.y0 value for
   * mixed datasets containing both positive and negative values.
   */
  Data.prototype._stackNegAndPosVals = function (d, y0, y) {
    const data = this.chartData();

    // Storing counters and data characteristics needed to stack values properly
    if (!this._cache) {
      this._cache = this._createCache();
    }

    d.y0 = this._calcYZero(y, this._cache.yValsArr);
    ++this._cache.index.stack;


    // last stack, or last value, reset the stack count and y value array
    const lastStack = (this._cache.index.stack >= this._cache.count.stacks);
    if (lastStack) {
      this._cache.index.stack = 0;
      ++this._cache.index.value;
      this._cache.yValsArr = [];
    // still building the stack collection, push v value to array
    } else if (y !== 0) {
      this._cache.yValsArr.push(y);
    }

    // last value, prepare for the next chart, if one exists
    const lastValue = (this._cache.index.value >= this._cache.count.values);
    if (lastValue) {
      this._cache.index.value = 0;
      ++this._cache.index.chart;

      // no more charts, reset the queue and finish
      if (this._cache.index.chart >= this._cache.count.charts) {
        this._cache = this._createCache();
        return;
      }

      // get stack and value count for next chart
      const chartSeries = data[this._cache.index.chart].series;
      this._cache.count.stacks = chartSeries.length;
      this._cache.count.values = chartSeries.length ? chartSeries[this._cache.index.stack].values.length : 0;
    }
  };

  Data.prototype.getDataType = function () {
    const data = this.getVisData();
    let type;

    data.forEach(function (obj) {
      if (obj.series) {
        type = 'series';
      } else if (obj.slices) {
        type = 'slices';
      } else if (obj.geoJson) {
        type = 'geoJson';
      }
    });

    return type;
  };

  /**
   * Returns an array of the actual x and y data value objects
   * from data with series keys
   *
   * @method chartData
   * @returns {*} Array of data objects
   */
  Data.prototype.chartData = function () {
    if (!this.data.series) {
      const arr = this.data.rows ? this.data.rows : this.data.columns;
      return _.toArray(arr);
    }
    return [this.data];
  };

  /**
   * Returns an array of chart data objects
   *
   * @method getVisData
   * @returns {*} Array of chart data objects
   */
  Data.prototype.getVisData = function () {
    let visData;

    if (this.data.rows) {
      visData = this.data.rows;
    } else if (this.data.columns) {
      visData = this.data.columns;
    } else {
      visData = [this.data];
    }

    return visData;
  };

  /**
   * get min and max for all cols, rows of data
   *
   * @method getMaxMin
   * @return {Object}
   */
  Data.prototype.getGeoExtents = function () {
    const visData = this.getVisData();

    return _.reduce(_.pluck(visData, 'geoJson.properties'), function (minMax, props) {
      return {
        min: Math.min(props.min, minMax.min),
        max: Math.max(props.max, minMax.max)
      };
    }, { min: Infinity, max: -Infinity });
  };

  /**
   * Returns array of chart data objects for pie data objects
   *
   * @method pieData
   * @returns {*} Array of chart data objects
   */
  Data.prototype.pieData = function () {
    if (!this.data.slices) {
      return this.data.rows ? this.data.rows : this.data.columns;
    }
    return [this.data];
  };

  /**
   * Get attributes off the data, e.g. `tooltipFormatter` or `xAxisFormatter`
   * pulls the value off the first item in the array
   * these values are typically the same between data objects of the same chart
   * TODO: May need to verify this or refactor
   *
   * @method get
   * @param thing {String} Data object key
   * @returns {*} Data object value
   */
  Data.prototype.get = function (thing, def) {
    const source = (this.data.rows || this.data.columns || [this.data])[0];
    return _.get(source, thing, def);
  };

  /**
   * Returns true if null values are present
   * @returns {*}
   */
  Data.prototype.hasNullValues = function () {
    const chartData = this.chartData();

    return chartData.some(function (chart) {
      return chart.series.some(function (obj) {
        return obj.values.some(function (d) {
          return d.y === null;
        });
      });
    });
  };

  /**
   * Return an array of all value objects
   * Pluck the data.series array from each data object
   * Create an array of all the value objects from the series array
   *
   * @method flatten
   * @returns {Array} Value objects
   */
  Data.prototype.flatten = function () {
    return _(this.chartData())
    .pluck('series')
    .flattenDeep()
    .pluck('values')
    .flattenDeep()
    .value();
  };

  /**
   * Determines whether histogram charts should be stacked
   * TODO: need to make this more generic
   *
   * @method shouldBeStacked
   * @returns {boolean}
   */
  Data.prototype.shouldBeStacked = function () {
    const isHistogram = (this._attr.type === 'histogram');
    const isArea = (this._attr.type === 'area');
    const isOverlapping = (this._attr.mode === 'overlap');
    const grouped = (this._attr.mode === 'grouped');

    const stackedHisto = isHistogram && !grouped;
    const stackedArea = isArea && !isOverlapping;

    return stackedHisto || stackedArea;
  };

  /**
   * Validates that the Y axis min value defined by user input
   * is a number.
   *
   * @param val {Number} Y axis min value
   * @returns {Number} Y axis min value
   */
  Data.prototype.validateUserDefinedYMin = function (val) {
    if (!_.isNumber(val)) {
      throw new Error('validateUserDefinedYMin expects a number');
    }
    return val;
  };

  /**
   * Calculates the lowest Y value across all charts, taking
   * stacking into consideration.
   *
   * @method getYMin
   * @param {function} [getValue] - optional getter that will receive a
   *                              point and should return the value that should
   *                              be considered
   * @returns {Number} Min y axis value
   */
  Data.prototype.getYMin = function (getValue) {
    const self = this;

    if (this._attr.mode === 'percentage' || this._attr.mode === 'wiggle' ||
      this._attr.mode === 'silhouette') {
      return 0;
    }

    const flat = this.flatten();
    // if there is only one data point and its less than zero,
    // return 0 as the yMax value.
    if (!flat.length || flat.length === 1 && flat[0].y > 0) {
      return 0;
    }

    let min = Infinity;

    // for each object in the dataArray,
    // push the calculated y value to the initialized array (arr)
    _.each(this.chartData(), function (chart) {
      const calculatedMin = self._getYExtent(chart, 'min', getValue);
      if (!_.isUndefined(calculatedMin)) {
        min = Math.min(min, calculatedMin);
      }
    });

    return min;
  };

  /**
   * Calculates the highest Y value across all charts, taking
   * stacking into consideration.
   *
   * @method getYMax
   * @param {function} [getValue] - optional getter that will receive a
   *                              point and should return the value that should
   *                              be considered
   * @returns {Number} Max y axis value
   */
  Data.prototype.getYMax = function (getValue) {
    const self = this;

    if (self._attr.mode === 'percentage') {
      return 1;
    }

    const flat = this.flatten();
    // if there is only one data point and its less than zero,
    // return 0 as the yMax value.
    if (!flat.length || flat.length === 1 && flat[0].y < 0) {
      return 0;
    }

    let max = -Infinity;

    // for each object in the dataArray,
    // push the calculated y value to the initialized array (arr)
    _.each(this.chartData(), function (chart) {
      const calculatedMax = self._getYExtent(chart, 'max', getValue);
      if (!_.isUndefined(calculatedMax)) {
        max = Math.max(max, calculatedMax);
      }
    });

    return max;
  };

  /**
   * Calculates the stacked values for each data object
   *
   * @method stackData
   * @param series {Array} Array of data objects
   * @returns {*} Array of data objects with x, y, y0 keys
   */
  Data.prototype.stackData = function (series) {
    // Should not stack values on line chart
    if (this._attr.type === 'line') return series;
    return this._attr.stack(series);
  };

  /**
   * Returns the max Y axis value for a `series` array based on
   * a specified callback function (calculation).
   * @param {function} [getValue] - Optional getter that will be used to read
   *                              values from points when calculating the extent.
   *                              default is either this._getYStack or this.getY
   *                              based on this.shouldBeStacked().
   */
  Data.prototype._getYExtent = function (chart, extent, getValue) {
    if (this.shouldBeStacked()) {
      this.stackData(_.pluck(chart.series, 'values'));
      getValue = getValue || this._getYStack;
    } else {
      getValue = getValue || this._getY;
    }

    const points = chart.series
    .reduce(function (points, series) {
      return points.concat(series.values);
    }, [])
    .map(getValue);

    return d3[extent](points);
  };

  /**
   * Calculates the y stack value for each data object
   */
  Data.prototype._getYStack = function (d) {
    return d.y0 + d.y;
  };

  /**
   * Calculates the Y max value
   */
  Data.prototype._getY = function (d) {
    return d.y;
  };

  /**
   * Helper function for getNames
   * Returns an array of objects with a name (key) value and an index value.
   * The index value allows us to sort the names in the correct nested order.
   *
   * @method returnNames
   * @param array {Array} Array of data objects
   * @param index {Number} Number of times the object is nested
   * @param columns {Object} Contains name formatter information
   * @returns {Array} Array of labels (strings)
   */
  Data.prototype.returnNames = function (array, index, columns) {
    const names = [];
    const self = this;

    _.forEach(array, function(obj) {
      names.push({
        label: obj.name,
        values: obj,
        index: index
      });

      if (obj.children) {
        const plusIndex = index + 1;

        _.forEach(self.returnNames(obj.children, plusIndex, columns), function (namedObj) {
          names.push(namedObj);
        });
      }
    });

    return names;
  };

  /**
   * Flattens hierarchical data into an array of objects with a name and index value.
   * The indexed value determines the order of nesting in the data.
   * Returns an array with names sorted by the index value.
   *
   * @method getNames
   * @param data {Object} Chart data object
   * @param columns {Object} Contains formatter information
   * @returns {Array} Array of names (strings)
   */
  Data.prototype.getNames = function (data, columns) {
    const slices = data.slices;

    if (slices.children) {
      const namedObj = this.returnNames(slices.children, 0, columns);

      return _(namedObj)
      .sortBy(function (obj) {
        return obj.index;
      })
      .unique(function (d) {
        return d.label;
      })
      .value();
    }
  };

  /**
   * Removes zeros from pie chart data
   * @param slices
   * @returns {*}
   */
  Data.prototype._removeZeroSlices = function (slices) {
    const self = this;

    if (!slices.children) return slices;

    slices = _.clone(slices);
    slices.children = slices.children.reduce(function (children, child) {
      if (child.size !== 0) {
        children.push(self._removeZeroSlices(child));
      }
      return children;
    }, []);

    return slices;
  };

  /**
   * Returns an array of names ordered by appearance in the nested array
   * of objects
   *
   * @method pieNames
   * @returns {Array} Array of unique names (strings)
   */
  Data.prototype.pieNames = function (data) {
    const self = this;
    const names = [];

    _.forEach(data, function (obj) {
      const columns = obj.raw ? obj.raw.columns : undefined;
      obj.slices = self._removeZeroSlices(obj.slices);

      _.forEach(self.getNames(obj, columns), function (name) {
        names.push(name);
      });
    });

    return _.uniq(names, 'label');
  };

  /**
   * Inject zeros into the data
   *
   * @method injectZeros
   * @returns {Object} Data object with zeros injected
   */
  Data.prototype.injectZeros = function () {
    return injectZeros(this.data);
  };

  /**
   * Returns an array of all x axis values from the data
   *
   * @method xValues
   * @returns {Array} Array of x axis values
   */
  Data.prototype.xValues = function () {
    return orderKeys(this.data);
  };

  /**
   * Return an array of unique labels
   * Curently, only used for vertical bar and line charts,
   * or any data object with series values
   *
   * @method getLabels
   * @returns {Array} Array of labels (strings)
   */
  Data.prototype.getLabels = function () {
    return getLabels(this.data);
  };

  /**
   * Returns a function that does color lookup on labels
   *
   * @method getColorFunc
   * @returns {Function} Performs lookup on string and returns hex color
   */
  Data.prototype.getColorFunc = function () {
    return color(this.getLabels(), this.uiState.get('vis.colors'));
  };

  /**
   * Returns a function that does color lookup on names for pie charts
   *
   * @method getPieColorFunc
   * @returns {Function} Performs lookup on string and returns hex color
   */
  Data.prototype.getPieColorFunc = function () {
    return color(this.pieNames(this.getVisData()).map(function (d) {
      return d.label;
    }), this.uiState.get('vis.colors'));
  };

  /**
   * ensure that the datas ordered property has a min and max
   * if the data represents an ordered date range.
   *
   * @return {undefined}
   */
  Data.prototype._normalizeOrdered = function () {
    const data = this.getVisData();
    const self = this;

    data.forEach(function (d) {
      if (!d.ordered || !d.ordered.date) return;

      const missingMin = d.ordered.min == null;
      const missingMax = d.ordered.max == null;

      if (missingMax || missingMin) {
        const extent = d3.extent(self.xValues());
        if (missingMin) d.ordered.min = extent[0];
        if (missingMax) d.ordered.max = extent[1];
      }
    });
  };

  /**
   * Calculates min and max values for all map data
   * series.rows is an array of arrays
   * each row is an array of values
   * last value in row array is bucket count
   *
   * @method mapDataExtents
   * @param series {Array} Array of data objects
   * @returns {Array} min and max values
   */
  Data.prototype.mapDataExtents = function (series) {
    const values = _.map(series.rows, function (row) {
      return row[row.length - 1];
    });
    const extents = [_.min(values), _.max(values)];
    return extents;
  };

  /**
   * Get the maximum number of series, considering each chart
   * individually.
   *
   * @return {number} - the largest number of series from all charts
   */
  Data.prototype.maxNumberOfSeries = function () {
    return this.chartData().reduce(function (max, chart) {
      return Math.max(max, chart.series.length);
    }, 0);
  };

  return Data;
}
