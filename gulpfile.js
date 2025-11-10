const gulp = require('gulp');
const inline = require('gulp-inline');
const { join } = require('node:path');

const [buildDir] = process.argv.slice(2);

gulp.task('default', () => gulp
  .src(join(buildDir, 'index.html'))
  .pipe(inline())
  .pipe(gulp.dest(join(buildDir, 'index-single.html'))),
);
