<p align="center">

Seed hệ thống chuẩn: từ root chạy `pnpm demo:seed`; để xóa dữ liệu local và nạp lại chạy `pnpm demo:reset` khi backend đã dừng. [Catalog, 14 tài khoản và kịch bản hai chi nhánh](../../docs/user-guide/demo-data.md). Các seed riêng bên dưới phục vụ chuẩn bị danh mục của từng service.
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

M3 status: authenticated list, unread-count, and mark-read APIs are implemented.
Reads fail closed unless the verified principal matches the local Identity
recipient snapshot. Migrations `0002` and `0003` have been applied and drift
checked only on the isolated `notification_test_db`. In addition to the seven
business event versions, the consumer now binds `NotificationRecipientSnapshot.v1`
to `notification-service.recipient-snapshots` and
`NotificationRecipientBootstrapCompleted.v1` to `notification-service.recipient-bootstrap`.
They dispatch to the existing projection handlers, preserving transactional inbox
deduplication, revision checks, bootstrap receipts, and tenant reconciliation.
Handler failures propagate to the shared RabbitMQ retry/DLQ mechanism.

Bootstrap marker metadata is validated against the shared catalog:
`aggregateType=RecipientBootstrap`, `aggregateId=payload.bootstrapRunId`.
Tenant scope remains in the envelope `tenantId`. A Tenant aggregate or a
mismatched run ID is rejected before persistence. The build script generates
the service's Prisma client before Nest compilation, including a clean source
checkout used by the backend Dockerfile; no pre-generated client is required.

Start Notification with `RABBITMQ_URL` configured and verify both durable queues
and their bindings on `pbl6.events` **before** running Identity bootstrap:
`pnpm --filter identity-service recipient:bootstrap <tenant-uuid>`.
If an earlier completed bootstrap was published before these queues were bound,
run it with `--new` to emit a fresh snapshot/marker set. Verify the local bootstrap
run reaches completion and recipient snapshots exist before testing fan-out.
If a previous marker was rejected by the former Tenant aggregate validation,
deploy this fix, restart Notification, then recapture with `--new` (or replay
the original marker through the owner's DLQ procedure). Identity's COMPLETED
output only means its snapshots/marker were enqueued: verify Notification's
`recipient_bootstrap_runs` has `marker_received=true`, equal expected/received
counts and `status=COMPLETED`. Do not update that status manually in SQL.
The valid marker reconciles pending tenant events, including WAITING_FOR_*
events that exhausted retries into MANUAL_REVIEW. Check pending reasons and
DLQs; a new bootstrap does not delete or silently rewrite an old rejected run.

Broker/bootstrap and Gateway API evidence for this fix is in
[the verification report](../../docs/reports/2026-11-03-notification-bootstrap-fix.md).
Browser/Android acceptance remains separate; unit dispatch checks alone do not
constitute M3 acceptance evidence.

See the [implementation readiness and verification](M3-INDEPENDENT-READINESS.md),
[Q3 contract review](M3-HUY-Q3-REVIEW.md), and
[Notification API contract](../../docs/api/notification.yaml).

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# PostgreSQL integration tests require NOTIFICATION_TEST_DATABASE_URL
# targeting notification_test_db. Set RABBITMQ_TEST_URL to enable the real
# broker delivery/redelivery test against a dedicated test broker.
$ pnpm run test:e2e:db

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## Branch service management (ADR 0022)

See [design](../../docs/decisions/0022-branch-service-management.md) and [runbook](../../docs/user-guide/branch-service-management.md). SERVICE_MANAGER handles both reception and dispatch; existing Dispatcher accounts remain compatible. Apply additive migrations before starting this version. Organization supplies the active primary branch live; tenant-wide customer/equipment master data and maintenance plans remain shared.
