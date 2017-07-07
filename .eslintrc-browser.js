module.exports = {
  "env": {
    "browser": true,
    "es6": false
  },
  "extends": [
    "eslint:recommended",
    "standard"
  ],
  "rules": {
    // Override some of standard js rules
    "semi": ["error", "always"],
    "comma-dangle": ["error", "never"],
  }
};