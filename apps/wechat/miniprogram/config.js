/**
 * Single source of truth for the shell's URL.
 *
 * Development: the GitHub Pages deployment is convenient for DevTools testing
 * with "do not verify valid domain names" enabled.
 *
 * Production: replace this with an owned HTTPS domain that is registered as a
 * WeChat business domain (for example https://lab.example.com/). github.io must
 * not be assumed to be accepted during review.
 */
module.exports = {
  PUBLIC_WEB_URL: 'https://michaelee125.github.io/circuitlab-alevel/'
};
