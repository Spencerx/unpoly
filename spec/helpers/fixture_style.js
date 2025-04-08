beforeAll(function() {
  let fixtureStyleElement = document.createElement('style')
  fixtureStyleElement.nonce = 'specs-nonce'
  document.head.appendChild(fixtureStyleElement)
  window.fixtureStyleSheet = fixtureStyleElement.sheet
})

afterEach(function() {
  while (fixtureStyleSheet.cssRules.length) {
    fixtureStyleSheet.deleteRule(0)
  }
})

window.fixtureStyle = function(rule) {
  fixtureStyleSheet.insertRule(rule, fixtureStyleSheet.cssRules.length)
}
