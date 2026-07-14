import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="app">
          <div className="header"><h1>Voodoo Wallet</h1></div>
          <div className="content">
            <p className="error">Something went wrong loading the wallet.</p>
            <p className="muted" style={{ wordBreak: 'break-word' }}>{error.message}</p>
            <p className="muted">Reload the extension at chrome://extensions and open dist, not the project root.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}