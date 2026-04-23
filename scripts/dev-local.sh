#!/bin/bash

# Infinitum 本地开发启动脚本
# 用法: ./scripts/dev-local.sh [start|stop|restart|logs]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PID_FILE="/tmp/infinitum-dev.pid"

cd "$PROJECT_ROOT"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 停止 Docker 容器
stop_docker() {
    log_info "检查并停止 Docker 容器..."
    if docker compose ps -q | grep -q .; then
        docker compose down 2>/dev/null || true
        log_success "Docker 容器已停止"
    else
        log_warn "没有运行的 Docker 容器"
    fi
}

# 停止本地进程
stop_local() {
    log_info "检查并停止本地开发进程..."

    # 停止 Next.js 开发服务器
    local pids=$(lsof -ti:3000,3002,3003 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
        log_success "本地开发进程已停止 (PIDs: $pids)"
    fi

    # 停止 worker 进程
    local worker_pids=$(pgrep -f "tsx scripts/run-worker" || true)
    if [ -n "$worker_pids" ]; then
        echo "$worker_pids" | xargs kill -9 2>/dev/null || true
        log_success "Worker 进程已停止"
    fi

    rm -f "$PID_FILE"
}

# 初始化项目
init_project() {
    log_info "检查项目依赖..."

    if [ ! -d "node_modules" ]; then
        log_warn "未找到 node_modules，正在安装依赖..."
        npm install
        log_success "依赖安装完成"
    fi

    if [ ! -f "prisma/dev.db" ]; then
        log_warn "未找到开发数据库，正在初始化..."
        npm run db:setup
        log_success "数据库初始化完成"
    fi

    # 生成 Prisma Client
    log_info "生成 Prisma Client..."
    npm run prisma:generate
    log_success "Prisma Client 已生成"
}

# 启动开发服务器
start_dev() {
    log_info "启动本地开发环境..."
    log_info "访问地址: http://localhost:3000"
    log_info "按 Ctrl+C 停止所有服务"
    echo ""

    # 使用 trap 捕获信号
    trap 'cleanup' INT TERM EXIT

    # 启动 Next.js 开发服务器
    log_info "启动 Next.js 开发服务器..."
    npm run dev &
    local next_pid=$!
    echo "$next_pid" > "$PID_FILE"

    sleep 3

    # 启动 Worker
    log_info "启动后台任务 Worker..."
    npm run worker &
    local worker_pid=$!
    echo "$worker_pid" >> "$PID_FILE"

    log_success "所有服务已启动！"
    echo ""
    log_info "前端: http://localhost:3000"
    log_info "按 Ctrl+C 停止所有服务"
    echo ""

    # 等待所有后台进程
    wait
}

# 清理函数
cleanup() {
    echo ""
    log_warn "正在停止所有服务..."

    local pids=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "$pids" | xargs kill -9 2>/dev/null || true
    fi

    # 确保所有相关进程都被停止
    local all_pids=$(lsof -ti:3000,3002,3003 2>/dev/null || true)
    if [ -n "$all_pids" ]; then
        echo "$all_pids" | xargs kill -9 2>/dev/null || true
    fi

    local worker_pids=$(pgrep -f "tsx scripts/run-worker" 2>/dev/null || true)
    if [ -n "$worker_pids" ]; then
        echo "$worker_pids" | xargs kill -9 2>/dev/null || true
    fi

    rm -f "$PID_FILE"
    log_success "所有服务已停止"
    exit 0
}

# 显示日志
show_logs() {
    log_info "实时日志（按 Ctrl+C 退出）..."
    echo ""
    tail -f .next/dev/logs/next-development.log 2>/dev/null || echo "日志文件未找到"
}

# 主命令处理
case "${1:-start}" in
    start)
        stop_docker
        stop_local
        init_project
        start_dev
        ;;
    stop)
        stop_docker
        stop_local
        log_success "所有服务已停止"
        ;;
    restart)
        stop_docker
        stop_local
        init_project
        start_dev
        ;;
    logs)
        show_logs
        ;;
    *)
        echo "用法: $0 [start|stop|restart|logs]"
        echo ""
        echo "命令:"
        echo "  start    - 停止 Docker 并启动本地开发环境（默认）"
        echo "  stop     - 停止所有服务"
        echo "  restart  - 重启本地开发环境"
        echo "  logs     - 查看实时日志"
        exit 1
        ;;
esac
