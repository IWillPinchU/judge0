#!/usr/bin/env bash
set -e

echo "=========================================================="
echo " Building Lightweight 4-Language Compilers Image..."
echo " C (GCC 12), C++ (G++ 12), Java (OpenJDK 21), Python (3.11) [Debian 12]"
echo "=========================================================="
docker build -t judge0-compilers-four:latest -f compilers/Dockerfile.four-languages compilers/

echo "=========================================================="
echo " Starting Judge0 4-Languages Stack (Server, Worker, DB, Redis)"
echo "=========================================================="
docker compose -f judge0/docker-compose.four-languages.yml up -d --build

echo "=========================================================="
echo " Judge0 is running on http://localhost:2358"
echo " Languages available: C (ID 50), C++ (ID 54), Java (ID 62), Python (ID 71)"
echo "=========================================================="

