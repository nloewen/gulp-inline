/**
 * Imports
 */

var through = require('through2')
var cheerio = require('cheerio')
var gulp = require('gulp')
var url = require('url')
var path = require('path')
var fs = require('fs')

/**
 * Inlinable type map
 */

var typeMap = {
  css: {
    tag: 'link',
    template: function (contents, el) {
      var attribute = el.attr('media')
      attribute = attribute ? ' media="' + attribute + '" ' : ''

      return '<style' + attribute + '>\n' + String(contents) + '\n</style>'
    },
    filter: function (el) {
      return el.attr('rel') === 'stylesheet' && isLocal(el.attr('href'))
    },
    getSrc: function (el) {
      return el.attr('href')
    }
  },

  js: {
    tag: 'script',
    template: function (contents) {
      return '<script type="text/javascript">\n' + String(contents) + '\n</script>'
    },
    filter: function (el) {
      return isLocal(el.attr('src'))
    },
    getSrc: function (el) {
      return el.attr('src')
    }
  },

  img: {
    tag: 'img',
    template: function (contents, el) {
      el.attr('src', 'data:image/unknown;base64,' + contents.toString('base64'))
      return cheerio.html(el)
    },
    filter: function (el) {
      var src = el.attr('src')
      return !/\.svg$/.test(src)
    },
    getSrc: function (el) {
      return el.attr('src')
    }
  },

  svg: {
    tag: 'img',
    template: function (contents) {
      return String(contents)
    },
    filter: function (el) {
      var src = el.attr('src')
      return /\.svg$/.test(src) && isLocal(src)
    },
    getSrc: function (el) {
      return el.attr('src')
    }
  }
}

function inject ($, process, base, cb, opts, relative, ignoredFiles) {
  var items = []

  $(opts.tag).each(function (idx, el) {
    el = $(el)
    if (opts.filter(el)) {
      items.push(el)
    }
  })

  if (items.length) {
    var done = after(items.length, cb)
    items.forEach(function (el) {
      var src = opts.getSrc(el) || ''
      var file = path.join(src[0] === '/' ? base : relative, src)

      if (fs.existsSync(file) && ignoredFiles.indexOf(src) === -1) {
        gulp.src(file)
          .pipe(process || noop())
          .pipe(replace(el, opts.template))
          .pipe(through.obj(function (file, enc, cb) {
            cb()
          }, done))
      } else {
        done()
      }
    })
  } else {
    cb()
  }
}

/**
 * Inline plugin
 */

function inline (opts) {
  opts = opts || {}
  opts.base = opts.base || ''
  opts.ignore = opts.ignore || []
  opts.disabledTypes = opts.disabledTypes || []

  return through.obj(function (file, enc, cb) {
    var self = this
    var $ = cheerio.load(String(file.contents), {decodeEntities: false})
    var typeKeys = Object.getOwnPropertyNames(typeMap)
    var done = after(typeKeys.length, function () {
      file.contents = new Buffer($.html())
      self.push(file)
      cb()
    })

    typeKeys.forEach(function (type) {
      if (opts.disabledTypes.indexOf(type) === -1) {
        inject($, opts[type], opts.base, done, typeMap[type], path.dirname(file.path), opts.ignore)
      } else {
        done()
      }
    })
  })
}

/**
 * Utilities
 */

function replace (el, tmpl) {
  return through.obj(function (file, enc, cb) {
    el.replaceWith(tmpl(file.contents, el))
    this.push(file)
    cb()
  })
}

function noop () {
  return through.obj(function (file, enc, cb) {
    this.push(file)
    cb()
  })
}

function after (n, cb) {
  var i = 0
  return function () {
    i++
    if (i === n) cb.apply(this, arguments)
  }
}

function isLocal (href) {
  return href && href.slice(0, 2) !== '//' && !url.parse(href).hostname
}

/**
 * Exports
 */

module.exports = inline
