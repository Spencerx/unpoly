u = up.util
$ = jQuery

window.AgentDetector = do ->

  match = (regexp) ->
    navigator.userAgent.match(regexp)

  isIE = ->
    match(/\bTrident\b/)

  isLegacyEdge = ->
    match(/\bEdge\b/)

  isSafari = ->
    match(/\bSafari\b/) && !match(/\bChrome\b/)

  isFirefox = ->
    match(/\bFirefox\b/)

  isIE: isIE
  isLegacyEdge: isLegacyEdge
  isSafari: isSafari
  isFirefox: isFirefox
