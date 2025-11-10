const gulp = require('gulp');
const inline = require('gulp-inline');
const { join } = require('node:path');

gulp.task('periodic-system-select-widget', singleHtmlTask('periodic-system-select-widget'));

function singleHtmlTask(distName) {
  const distPath = join('./dist', distName);
  return () => gulp
    .src(join(distPath, 'browser/index.html'))
    .pipe(inline())
    .pipe(gulp.dest(join(distPath, 'packed')));
}
