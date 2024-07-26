u = up.util
e = up.element

if up.migrate.loaded
  describe 'up.modal (deprecated)', ->

    describe 'unobtrusive behavior', ->

      describe '[up-modal]', ->

        it 'is converted to [up-layer="new modal"][up-follow] without target', ->
          link = fixture('a[href="/path"][up-modal]')
          up.hello(link)
          expect(link).not.toHaveAttribute('up-modal')
          expect(link).toHaveAttribute('up-layer', 'new modal')
          expect(link).toHaveAttribute('up-follow', '')

        it 'is converted to [up-layer="new modal"][up-target=...] with target', ->
          link = fixture('a[href="/path"][up-modal=".target"]')
          up.hello(link)
          expect(link).not.toHaveAttribute('up-modal')
          expect(link).toHaveAttribute('up-layer', 'new modal')
          expect(link).toHaveAttribute('up-target', '.target')
