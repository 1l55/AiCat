// StateMachine：宠物有限状态机（IDLE/WALK/SLEEP/EAT/CHAT/PLAY）
(function () {
  const { PetState } = window.PetConstants;

  class StateMachine {
    constructor(onEnter) {
      this.state = PetState.IDLE;
      this.onEnter = onEnter || (() => {});
      this.lastInteraction = Date.now();
      this.locked = false; // EAT/CHAT/PLAY 期间锁定，禁止自主行为打断
    }

    can(next) {
      // PLAY/CHAT/EAT 进行中只允许显式结束
      if (this.locked && next !== PetState.IDLE) return false;
      return true;
    }

    transition(next, { lock = false } = {}) {
      if (this.state === next && !lock) return;
      this.state = next;
      this.locked = lock;
      this.onEnter(next);
    }

    markInteraction() { this.lastInteraction = Date.now(); }
    idleFor() { return Date.now() - this.lastInteraction; }
    is(s) { return this.state === s; }
  }

  window.StateMachine = StateMachine;
})();
