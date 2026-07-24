import { Component } from 'react';
import { getMessages } from '../lib/i18n/index.js';

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
      const msgs = getMessages(document.documentElement.lang || 'en');
      return (
        <div className="app">
          <div className="header"><h1>{msgs.app_name}</h1></div>
          <div className="content">
            <p className="error">{msgs.error_boundary_title}</p>
            <p className="muted" style={{ wordBreak: 'break-word' }}>{error.message}</p>
            <p className="muted">{msgs.error_boundary_hint}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}