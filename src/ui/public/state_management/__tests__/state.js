
import _ from 'lodash';
import sinon from 'sinon';
import expect from 'expect.js';
import ngMock from 'ng_mock';
import 'ui/private';
import StateManagementStateProvider from 'ui/state_management/state';
import EventsProvider from 'ui/events';

describe('State Management', function () {
  let $rootScope;
  let $location;
  let State;
  let Events;

  beforeEach(ngMock.module('kibana'));
  beforeEach(ngMock.inject(function (_$rootScope_, _$location_, Private) {
    $location = _$location_;
    $rootScope = _$rootScope_;
    State = Private(StateManagementStateProvider);
    Events = Private(EventsProvider);
  }));

  describe('Provider', function () {
    it('should reset the state to the defaults', function () {
      const state = new State('_s', { message: ['test'] });
      state.reset();
      const search = $location.search();
      expect(search).to.have.property('_s');
      expect(search._s).to.equal('(message:!(test))');
      expect(state.message).to.eql(['test']);
    });

    it('should apply the defaults upon initialization', function () {
      const state = new State('_s', { message: 'test' });
      expect(state).to.have.property('message', 'test');
    });

    it('should inherit from Events', function () {
      const state = new State();
      expect(state).to.be.an(Events);
    });

    it('should emit an event if reset with changes', function (done) {
      const state = new State('_s', { message: 'test' });
      state.on('reset_with_changes', function (keys) {
        expect(keys).to.eql(['message']);
        done();
      });
      state.save();
      state.message = 'foo';
      state.reset();
      $rootScope.$apply();
    });

    it('should not emit an event if reset without changes', function () {
      const state = new State('_s', { message: 'test' });
      state.on('reset_with_changes', function () {
        expect().fail();
      });
      state.save();
      state.message = 'test';
      state.reset();
      $rootScope.$apply();
    });
  });

  describe('Search', function () {
    it('should save to $location.search()', function () {
      const state = new State('_s', { test: 'foo' });
      state.save();
      const search = $location.search();
      expect(search).to.have.property('_s');
      expect(search._s).to.equal('(test:foo)');
    });

    it('should emit an event if changes are saved', function (done) {
      const state = new State();
      state.on('save_with_changes', function (keys) {
        expect(keys).to.eql(['test']);
        done();
      });
      state.test = 'foo';
      state.save();
      const search = $location.search();
      $rootScope.$apply();
    });
  });

  describe('Fetch', function () {
    it('should emit an event if changes are fetched', function (done) {
      const state = new State();
      state.on('fetch_with_changes', function (keys) {
        expect(keys).to.eql(['foo']);
        done();
      });
      $location.search({ _s: '(foo:bar)' });
      state.fetch();
      expect(state).to.have.property('foo', 'bar');
      $rootScope.$apply();
    });

    it('should have events that attach to scope', function (done) {
      const state = new State();
      state.on('test', function (message) {
        expect(message).to.equal('foo');
        done();
      });
      state.emit('test', 'foo');
      $rootScope.$apply();
    });

    it('should fire listeners for #onUpdate() on #fetch()', function (done) {
      const state = new State();
      state.on('fetch_with_changes', function (keys) {
        expect(keys).to.eql(['foo']);
        done();
      });
      $location.search({ _s: '(foo:bar)' });
      state.fetch();
      expect(state).to.have.property('foo', 'bar');
      $rootScope.$apply();
    });

    it('should apply defaults to fetches', function () {
      const state = new State('_s', { message: 'test' });
      $location.search({ _s: '(foo:bar)' });
      state.fetch();
      expect(state).to.have.property('foo', 'bar');
      expect(state).to.have.property('message', 'test');
    });

    it('should call fetch when $routeUpdate is fired on $rootScope', function () {
      const state = new State();
      const spy = sinon.spy(state, 'fetch');
      $rootScope.$emit('$routeUpdate', 'test');
      sinon.assert.calledOnce(spy);
    });

    it('should clear state when missing form URL', function () {
      let stateObj;
      const state = new State();

      // set satte via URL
      $location.search({ _s: '(foo:(bar:baz))' });
      state.fetch();
      stateObj = state.toObject();
      expect(stateObj).to.eql({ foo: { bar: 'baz' } });

      // ensure changing URL changes state
      $location.search({ _s: '(one:two)' });
      state.fetch();
      stateObj = state.toObject();
      expect(stateObj).to.eql({ one: 'two' });

      // remove search, state should be empty
      $location.search({});
      state.fetch();
      stateObj = state.toObject();
      expect(stateObj).to.eql({});
    });
  });
});
