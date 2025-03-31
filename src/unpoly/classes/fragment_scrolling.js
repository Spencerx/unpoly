const u = up.util

up.FragmentScrolling = class FragmentScrolling extends up.FragmentProcessor {

  keys() {
    return super.keys().concat([
      'hash',
      'mode',
      'revealTop',
      'revealMax',
      'revealSnap',
      'scrollBehavior',
    ])
  }

  processPrimitive(opt) {
    switch (opt) {
      case 'top':
        return this._reset()
      case 'layer':
        return this._revealLayer()
      case 'main':
        return this._revealSelector(':main')
      case 'restore':
        return this._restore()
      case 'hash':
        return this.hash && up.viewport.revealHash(this.hash, this.attributes())
      case 'target':
      case 'reveal':
      case true:
        return this._revealElement(this.fragment)
      default:
        if (u.isString(opt)) {
          return this._revealSelector(opt)
        }
    }
  }

  processElement(element) {
    return this._revealElement(element)
  }

  _revealElement(element) {
    if (element) {
      up.reveal(element, this.attributes())
      return true
    }
  }

  _revealSelector(selector) {
    let match = this.findSelector(selector)
    return this._revealElement(match)
  }

  _revealLayer() {
    // Reveal the layer's box instead of the layer's element.
    // If the layer has its own viewport, like a modal, revealing the box will
    // scroll the layer viewport. Revealing the layer element would scroll
    // the main document viewport.
    return this._revealElement(this.layer.getBoxElement())
  }

  _reset() {
    // With an undefined fragment reference, resetScroll() resets all viewports in { layer }
    up.viewport.resetScroll(this.fragment, this.attributes())
    return true
  }

  _restore() {
    // With an undefined fragment reference, restoreScroll() restores all viewports in { layer }
    return up.viewport.restoreScroll(this.fragment, this.attributes())
  }
}
