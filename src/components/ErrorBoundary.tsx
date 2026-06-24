import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary:', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <div className="error">
          <p>화면 처리 중 오류가 발생했습니다: {this.state.error.message}</p>
          <button type="button" onClick={this.reset}>
            다시 시도
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
