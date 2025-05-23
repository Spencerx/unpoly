const u = up.util
const e = up.element

up.FormValidator = class FormValidator {

  constructor(form) {
    this._form = form
    this._dirtySolutions = []
    this._nextRenderTimer = null
    this._rendering = false
    this._honorAbort()
  }

  start() {
    let guard = (field) => this._isValidatingField(field)
    let callback = (field) => this._onFieldAdded(field)
    return up.form.trackFields(this._form, { guard }, callback)
  }

  _isValidatingField(field) {
    return field.closest('[up-validate]:not([up-validate=false])')
  }

  _onFieldAdded(field) {
    let eventType = up.form.validateOptions(field).event
    return up.on(field, eventType, (event) => {
      up.log.putsEvent(event)
      up.error.muteUncriticalRejection(this.validate({ origin: field }))
    })
  }

  _honorAbort() {
    up.fragment.onAborted(this._form, (event) => this._onAborted(event))
  }

  _onAborted(event) {
    let abortedError = new up.Aborted(event.reason)
    let solution
    while (solution = this._dirtySolutions.shift()) {
      solution.deferred.reject(abortedError)
    }
  }

  validate(options = {}) {
    let newSolutions = this._getSolutions(options)
    this._dirtySolutions.push(...newSolutions)
    this._scheduleNextRender()
    return newSolutions[0]?.deferred
  }

  _getSolutions(options) {
    let solutions = this._getTargetSelectorSolutions(options)
      || this._getFieldSolutions(options)
      || this._getElementSolutions(options.origin)

    // Although a single validate() call may update multiple fragments,
    // they will all share the same render pass.
    let deferred = u.newDeferred()

    for (let solution of solutions) {
      // Remember solution-specific render options from
      // (1) the given options object
      // (2) any [up-watch-] prefixed attributes parsed from the origin
      // (3) any [up-validate-] prefixed attributes parsed from the origin
      let renderOptions = up.form.validateOptions(solution.origin, options)
      solution.batch = u.pluckKey(renderOptions, 'batch')
      solution.renderOptions = renderOptions

      solution.destination = `${renderOptions.method} ${renderOptions.url}`
      // Resolve :origin pseudo here, as a batched validation will only
      // have a single { origin } (set to the form).
      solution.target = up.fragment.resolveOrigin(solution.target, solution)
      solution.deferred = deferred
    }

    return solutions
  }

  _getFieldSolutions({ origin, ...options }) {
    if (up.form.isField(origin)) {
      return this._getValidateAttrSolutions(origin) || this._getFormGroupSolutions(origin, options)
    }
  }

  _getFormGroupSolutions(field, { formGroup = true }) {
    if (!formGroup) return

    let solution = up.form.groupSolution(field)
    if (solution) {
      up.puts('up.validate()', 'Validating form group of field %o', field)
      return [solution]
    }
  }

  _getTargetSelectorSolutions({ target, origin }) {
    if (u.isString(target)) {
      up.puts('up.validate()', 'Validating target "%s"', target)
      let simpleSelectors = up.fragment.splitTarget(target)
      return u.compact(simpleSelectors.map(function(simpleSelector) {
        let element = up.fragment.get(simpleSelector, { origin })
        if (element) {
          return {
            element,
            target: simpleSelector,
            origin
          }
        } else {
          up.fail('Validation target "%s" does not match an element', simpleSelector)
        }
      }))
    }
  }

  _getElementSolutions(element) {
    up.puts('up.validate()', 'Validating element %o', element)
    return [{
      element,
      target: up.fragment.toTarget(element),
      origin: element
    }]
  }

  _getValidateAttrSolutions(field) {
    // In case of radio buttons the [up-validate] attribute will
    // be set on a container containing the entire radio button group.
    let containerWithAttr = field.closest('[up-validate]')

    if (containerWithAttr) {
      let target = e.booleanOrStringAttr(containerWithAttr, 'up-validate')
      return this._getTargetSelectorSolutions({ target, origin: field })
    }
  }

  _scheduleNextRender() {
    let solutionDelays = this._dirtySolutions.map((solution) => solution.renderOptions.delay)
    let shortestDelay = Math.min(...solutionDelays) || 0
    // Render requests always reset the timer, using their then-current delay.
    clearTimeout(this._nextRenderTimer)
    this._nextRenderTimer = u.timer(shortestDelay, () => {
      this._nextRenderTimer = null
      this._renderDirtySolutions()
    })
  }

  _renderDirtySolutions() {
    up.error.muteUncriticalRejection(this._doRenderDirtySolutions())
  }

  async _doRenderDirtySolutions() {
    // We do *not* remove solutions for which the origin no longer exists,
    // as a delayed solution's { target } may still require an update.

    // When aborted we clear out _dirtySolutions to cancel a scheduled callback.
    if (!this._dirtySolutions.length) return

    // We don't run callbacks when a prior async callback is still running.
    // We will call _requestCallback() again once the prior callback terminates.
    if (this._rendering) return

    // When we re-called _requestCallback() after waiting for a prior callback, another
    // debounce delay may have started while waiting for the prior callback.
    // We must not shorted that debounce delay.
    if (this._nextRenderTimer) return

    let solutionsBatch = this._selectDirtySolutionsBatch()

    let renderOptions = this._mergeRenderOptions(solutionsBatch)

    // We don't render concurrently. If additional fields want to validate
    // while our request is in flight, they add to a new @dirtySolutions array.
    this._rendering = true

    try {
      // Resolve all promises we have handed out for the now-rendered solutions.
      let renderPromise = up.render(renderOptions)
      for (let solution of solutionsBatch) {
        solution.deferred.resolve(renderPromise)
      }
      await renderPromise
    } finally {
      this._rendering = false
      // Additional solutions may have become dirty while we were _rendering so we check again.
      // If no pending solutions are found, the method will return immediately.
      this._renderDirtySolutions()
    }
  }

  _selectDirtySolutionsBatch() {
    let batch = []
    let i = 0
    while (i < this._dirtySolutions.length) {
      let solution = this._dirtySolutions[i]
      if (batch.length === 0 || this._canBatchSolutions(batch[0], solution)) {
        batch.push(solution)
        this._dirtySolutions.splice(i, 1)
      } else {
        i++
      }
    }
    return batch
  }

  _canBatchSolutions(s1, s2) {
    return s1.destination === s2.destination && s1.batch && s2.batch
  }

  _mergeRenderOptions(dirtySolutions) {
    // Dirty fields are the fields that triggered the validation, not the fields contained
    // by the solution elements. This is not the same thing in a scenario like this:
    //
    //     <form>
    //       <input type="text" name="email" up-validate=".results">
    //       <div class="results"></div>
    //     </form>

    // Remove duplicate names as a radio button group has multiple inputs with the same name.
    let dirtyOrigins = u.map(dirtySolutions, 'origin')
    let dirtyFields = u.flatMap(dirtyOrigins, up.form.fields)
    let dirtyNames = u.uniq(u.map(dirtyFields, 'name'))
    let dirtyRenderOptionsList = u.map(dirtySolutions, 'renderOptions')

    let formDestinationOptions = up.form.destinationOptions(this._form)

    // (1) Merge together all render options for all origins.
    // (2) Adopt some formDestinationOptions that cannot be overridden by solutions,
    //     like { contentType } or { submitButton }.
    // (3) u.mergeDefined() does not skip undefined objects, it skips entries in objects
    //     that have an undefined value.
    let options = u.mergeDefined(formDestinationOptions, ...dirtyRenderOptionsList)

    // Update the collected targets of all solutions.
    options.target = u.map(dirtySolutions, 'target').join(', ')

    // Since we may render multiple dirty elements we cannot have individual origins
    // for each. We already resolved an :origin selector in getSolution(), so we don't
    // need { origin } for target resolution.
    options.origin = this._form

    // In case we're replacing an input that the user is typing in,
    // preserve focus, selection and scroll positions.
    options.focus ??= 'keep'

    // The protocol doesn't define whether the validation results in a status code.
    // Some backends might want to communicate a failed validation, others might not.
    // In any case we render the same targets for both success and failure.
    //
    // In cases when the server does respond with an error status, we still want to
    // reject the up.validate() promise. Hence we use { failOptions: false } instead of
    // { fail: false }.
    options.failOptions = false

    // Re-rendering forms may cause dependent elements to disappear.
    // Let's not blow up the render pass in that case.
    options.defaultMaybe = true

    // We can receive params from
    // (1) A <form up-params="..."> JSON attribute, obtained by up.form.destinationOptions() above
    // (2) one or more up.validate({ params }) calls
    options.params = up.Params.merge(
      formDestinationOptions.params,
      ...u.map(dirtyRenderOptionsList, 'params')
    )

    // We can receive headers from
    // (1) A <form up-headers="..."> JSON attribute, obtained by up.form.destinationOptions() above
    // (2) one or more up.validate({ headers }) calls
    options.headers = u.merge(
      formDestinationOptions.headers,
      ...u.map(dirtyRenderOptionsList, 'headers')
    )

    // Make sure the X-Up-Validate header is present, so the server-side
    // knows that it should not persist the form submission
    this._addValidateHeader(options.headers, dirtyNames)

    // If any solution wants feedback, they all get it.
    options.feedback = u.some(dirtyRenderOptionsList, 'feedback')

    // Each up.validate({ data }) call should only apply to the targeted element,
    options.data = undefined
    options.dataMap = u.mapObject(dirtySolutions, ({ target, element, renderOptions: { data, keepData } }) => [
      target,
      keepData ? up.data(element) : data
    ])

    // Each up.validate({ preview }) call should only apply to the targeted element,
    options.preview = undefined
    options.previewMap = u.mapObject(dirtySolutions, ({ target, renderOptions: { preview } }) => [target, preview])

    // Each up.validate({ placeholder }) call should only apply to the targeted element,
    options.placeholder = undefined
    options.placeholderMap = u.mapObject(dirtySolutions, ({ target, renderOptions: { placeholder } }) => [target, placeholder])

    // We may render multiple solutions with { disable } options, and most disable options
    // are specific to an { origin }, e.g. `{ disable: '.form-group:has(:origin)'}
    // Since up.render() can only take a single { origin },
    // we resolve it here.
    //
    // Disabling the same elements multiple time is not an issue since up.form.disableTemp()
    // only sees enabled elements.
    options.disable = dirtySolutions.map((solution) => up.fragment.resolveOrigin(solution.renderOptions.disable, solution))

    // The guardEvent will be emitted on the render pass' { origin }, so the form in this case.
    // The guardEvent will also be assigned a { renderOptions } attribute in up.render()
    options.guardEvent = up.event.build('up:form:validate', {
      fields: dirtyFields,
      log: 'Validating form',
      params: options.params,
      form: this._form,
    })

    return options
  }

  _addValidateHeader(headers, names) {
    let key = up.protocol.headerize('validate')
    let value = names.join(' ')
    if (!value || value.length > up.protocol.config.maxHeaderSize) value = ':unknown'
    headers[key] = value
  }

}
