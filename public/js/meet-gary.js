(() => {
  const root = document.getElementById('nexus');
  const triggers = [...document.querySelectorAll('[data-nexus-schedule]')];

  if (!root || triggers.length === 0) return;

  const heading = root.querySelector('.nexus__greeting');
  const support = root.querySelector('.nexus__support');
  const status = root.querySelector('.nexus__status');

  if (!heading || !support || !status) return;

  const enterSchedulingMode = () => {
    root.classList.add('is-scheduling');
    heading.textContent = 'Let’s schedule a conversation.';
    support.textContent = 'Tell me what you’d like to automate and when you’d prefer to meet.';
    status.textContent = 'SCHEDULING PREVIEW';
  };

  triggers.forEach((trigger) => trigger.addEventListener('click', enterSchedulingMode));
})();
