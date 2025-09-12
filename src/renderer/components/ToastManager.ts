export class ToastManager {
  show(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
    const toastContainer = document.getElementById('toast-container')!;
    const toastId = `toast-${Date.now()}`;

    const toastColors = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      warning: 'bg-yellow-500'
    };

    const toastIcons = {
      success: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>`,
      error: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
      </svg>`,
      warning: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
      </svg>`
    };

    const toastElement = document.createElement('div');
    toastElement.id = toastId;
    toastElement.className = `flex items-center space-x-3 px-4 py-3 ${toastColors[type]} text-white rounded-lg shadow-lg transform translate-x-full transition-all duration-300 ease-out max-w-sm`;
    toastElement.innerHTML = `
      <div class="flex-shrink-0">
        ${toastIcons[type]}
      </div>
      <div class="flex-1 text-sm font-medium">
        ${message}
      </div>
      <button class="flex-shrink-0 hover:bg-white/20 rounded-full p-1 transition-colors duration-200" onclick="this.parentElement.remove()">
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    `;

    toastContainer.appendChild(toastElement);

    // Trigger animation
    setTimeout(() => {
      toastElement.classList.remove('translate-x-full');
      toastElement.classList.add('translate-x-0');
    }, 10);

    // Auto-dismiss after 3 seconds
    setTimeout(() => {
      if (toastElement.parentElement) {
        toastElement.classList.remove('translate-x-0');
        toastElement.classList.add('translate-x-full');
        setTimeout(() => {
          toastElement.remove();
        }, 300);
      }
    }, 3000);
  }

  showSuccess(message: string): void {
    this.show(message, 'success');
  }

  showError(message: string): void {
    this.show(message, 'error');
  }

  showWarning(message: string): void {
    this.show(message, 'warning');
  }
}
