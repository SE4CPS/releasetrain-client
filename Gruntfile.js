module.exports = function (grunt) {

    // Project configuration
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),

        // Minify HTML
        minifyHtml: {
            options: {
                cdata: true
            },
            dist: {
                files: {
                    'dist/ack/index.html': 'src/ack/index.html',
                    'dist/app.css': 'src/app.css',
                    'dist/common/github.html': 'src/common/github.html',
                    'dist/common/navigation.html': 'src/common/navigation.html',
                    'dist/edi40/index.html': 'src/edi40/index.html',
                    'dist/edi40/2024/index.html': 'src/edi40/2024/index.html',
                    'dist/edi40-2023/index.html': 'src/edi40-2023/index.html',
                    'dist/graph/index.html': 'src/graph/index.html',
                    'dist/reddit/index.html': 'src/reddit/index.html',
                    'dist/mltl/index.html': 'src/mltl/index.html',
                    'dist/dashboard/index.html': 'src/dashboard/index.html',
                    'dist/index.html': 'src/index.html',
                    'dist/doc/index.html': 'src/doc/index.html',
                    'dist/research/index.html': 'src/research/index.html',
                    'dist/readme/index.html': 'src/readme/index.html',
                    'dist/reset.css': 'src/reset.css',
                    'dist/plantuml-core.jar': 'src/plantuml-core.jar',
                    'dist/plantuml-core.jar.js': 'src/plantuml-core.jar.js',
                    'dist/plantuml.js': 'src/plantuml.js',
                    'dist/app.js': 'src/app.js'
                }
            }
        },

        // Copy task for static files
        copy: {
            dist: {
                files: [
                    {
                        expand: true,  // Enable dynamic expansion
                        cwd: 'src/',   // Base path
                        src: ['**'],   // Copy all files
                        dest: 'dist/', // Destination path
                        dot: false     // Exclude hidden files
                    }
                ]
            }
        }
    });

    // Load necessary Grunt tasks
    grunt.loadNpmTasks('grunt-contrib-copy');

    // Default task
    grunt.registerTask('default', ['copy']);
};