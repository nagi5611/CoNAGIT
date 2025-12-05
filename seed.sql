-- テストユーザーの作成 (パスワード: "password123")
INSERT OR IGNORE INTO users (username, password, email) VALUES 
  ('admin', 'password123', 'admin@example.com'),
  ('user1', 'password123', 'user1@example.com'),
  ('user2', 'password123', 'user2@example.com');

-- テストプロジェクトの作成
INSERT OR IGNORE INTO projects (id, name, description, progress, created_by) VALUES 
  (1, 'Team Dashboard', 'チームダッシュボードプロジェクト', 75, 1),
  (2, 'Mobile App', 'モバイルアプリ開発', 45, 1),
  (3, 'Website Redesign', 'ウェブサイトリニューアル', 30, 2);

-- プロジェクトメンバーの追加
INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES 
  (1, 1, 'owner'),
  (1, 2, 'member'),
  (2, 1, 'owner'),
  (2, 3, 'member'),
  (3, 2, 'owner'),
  (3, 3, 'member');

-- 子プロジェクトの追加
INSERT OR IGNORE INTO subprojects (id, project_id, name, description) VALUES 
  (1, 1, 'Frontend', 'フロントエンド開発'),
  (2, 1, 'Backend', 'バックエンド開発'),
  (3, 2, 'iOS', 'iOS開発'),
  (4, 2, 'Android', 'Android開発');

-- ファイルの追加
INSERT OR IGNORE INTO files (id, subproject_id, name, content, updated_by) VALUES 
  (1, 1, 'index.html', '<!DOCTYPE html><html>...</html>', 2),
  (2, 1, 'styles.css', 'body { margin: 0; }', 2),
  (3, 2, 'server.js', 'const express = require("express");', 1),
  (4, 3, 'ViewController.swift', 'import UIKit', 3);

-- タイムラインの追加
INSERT OR IGNORE INTO timeline (project_id, user_id, file_id, action, description) VALUES 
  (1, 2, 1, 'created', 'index.htmlを作成しました'),
  (1, 2, 2, 'created', 'styles.cssを作成しました'),
  (1, 1, 3, 'created', 'server.jsを作成しました'),
  (1, 2, 1, 'updated', 'index.htmlを更新しました'),
  (2, 3, 4, 'created', 'ViewController.swiftを作成しました');
