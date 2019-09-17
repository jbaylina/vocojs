var browserify = require('browserify');
var gulp = require('gulp');
var uglify = require('gulp-uglify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var clean = require('gulp-clean');

gulp.task('vocojs-release', ['clean'], function() {
  return browserify('./js/vococlass.js')
    .bundle()
    .pipe(source('voco-1.0.js')) // gives streaming vinyl file object
    .pipe(buffer()) // <----- convert from streaming to buffered vinyl file object
    .pipe(uglify()) // now gulp-uglify works
    .pipe(gulp.dest('./build'));
});

gulp.task('vocojs-debug', ['clean'], function() {
  return browserify('./js/vococlass.js', {debug: true})
    .bundle()
    .pipe(source('voco-1.0-debug.js')) // gives streaming vinyl file object
    .pipe(gulp.dest('./build'));
});

gulp.task('static', ['clean'], function() {
    gulp.src(["./chat/*"])
        .pipe(gulp.dest("./build"));
});

gulp.task('clean', function(cb) {
  // You can use multiple globbing patterns as you would with `gulp.src`
    return gulp.src('build', {read: false})
        .pipe(clean());
});


gulp.task('build', ['static', 'vocojs-release', 'vocojs-debug']);

gulp.task('default', ['build']);
