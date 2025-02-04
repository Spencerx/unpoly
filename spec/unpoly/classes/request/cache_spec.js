describe('up.Request.Cache', function() {
  describe('#track', function() {
    it('resolves the given new request when the given cached request is resolved')

    it('rejects the given new request when the given cached request is rejected')

    it('aborts the given new request when the given cached request is aborted', async function() {
      let sourceRequest = new up.Request({ url: '/foo' })

      let followingRequest = new up.Request({ url: '/foo' })
      up.cache.track(sourceRequest, followingRequest)

      expect(sourceRequest.state).toEqual('new')
      expect(followingRequest.state).toEqual('tracking')

      await wait()

      sourceRequest.abort()

      await expectAsync(sourceRequest).toBeRejectedWith(jasmine.any(up.Aborted))
      expect(sourceRequest.state).toEqual('aborted')

      await expectAsync(followingRequest).toBeRejectedWith(jasmine.any(up.Aborted))
      expect(followingRequest.state).toEqual('aborted')
    })
  })
})

