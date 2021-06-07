import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';

import * as ecr from '@aws-cdk/aws-ecr';

import * as ecs_patterns from "@aws-cdk/aws-ecs-patterns";

import * as elasticcache from '@aws-cdk/aws-elasticache'

import { LifecycleRule, TagStatus } from '@aws-cdk/aws-ecr';

import * as dotenv from 'dotenv'
import { ApplicationLoadBalancedFargateService } from '@aws-cdk/aws-ecs-patterns';
import { getParam } from './util';
import { TaskDefinition } from '@aws-cdk/aws-ecs';

dotenv.config();

export interface IENVIRONMENTS {
  DATABASE_URI: string;
  API_GERAL_TOKEN: string;
  PORT: string;
  CPU_LIMIT: string;
  MEMORY_LIMIT: string;
  DESIRED_COUNT: string;
  NEW_RELIC_ENABLED: string;
  REDIS_HOST: string;
  REDIS_PORT: string;
  REDIS_KEYPREFIX: string;
  REDIS_TTL_EXPIRE: string;
}

interface ILoadEEnvParameters {
  SERVICE_NAME: string
}

export class AwsStack extends cdk.Stack {
  vpc: ec2.Vpc;
  cluster: ecs.Cluster;
  repositories: Map<string, ecr.Repository> = new Map();
  appLoadBalenced: Map<string, ApplicationLoadBalancedFargateService> = new Map();
  serviceName: string | null;
  services: string[] = [];
  environmentService: string ;
  envsParameters: IENVIRONMENTS;
  mapEnvParameters: Map<string, IENVIRONMENTS> = new Map();


  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    this.environmentService = process.env.ENVIRONMENT !== 'production' ? 'dev' : 'prod';
    // this.serviceName = process.env.SERVICE_NAME  || null;
    this.services = process.env.SERVICES ? JSON.parse(process.env.SERVICES) : null;

  }

  private async loadEnvironments({ SERVICE_NAME }: ILoadEEnvParameters): Promise<IENVIRONMENTS> {
    const prefixPath = `/${this.environmentService}/${SERVICE_NAME}`;

    console.info(`Reading env variables on AWS Parameter Store`);
    console.info({ prefixPath });

    const [
      CPU_LIMIT,
      MEMORY_LIMIT,
      DESIRED_COUNT,
      APP_PORT,
      DATABASE_URI,
      API_GERAL_TOKEN,
      NEW_RELIC_ENABLED,
      REDIS_HOST,
      REDIS_PORT,
      REDIS_TTL_EXPIRE
    ] = await Promise.all(
      [
        getParam(`${prefixPath}/CPU_LIMIT`),
        getParam(`${prefixPath}/MEMORY_LIMIT`),
        getParam(`${prefixPath}/DESIRED_COUNT`),
        getParam(`${prefixPath}/APP_PORT`),

        getParam(`${prefixPath}/DATABASE_URI`),
        getParam(`${prefixPath}/API_GERAL_TOKEN`),
        getParam(`${prefixPath}/NEW_RELIC_ENABLED`),
        
        getParam(`${prefixPath}/REDIS_HOST`),
        getParam(`${prefixPath}/REDIS_PORT`),
        getParam(`${prefixPath}/REDIS_TTL_EXPIRE`),
      ]
    )
    
    const envs: IENVIRONMENTS = {
      CPU_LIMIT: String(CPU_LIMIT),
      MEMORY_LIMIT: String(MEMORY_LIMIT),
      DESIRED_COUNT: String(DESIRED_COUNT),

      PORT: String(APP_PORT),
      DATABASE_URI: String(DATABASE_URI),

      API_GERAL_TOKEN: String(API_GERAL_TOKEN),
      NEW_RELIC_ENABLED: String(NEW_RELIC_ENABLED),
      REDIS_HOST: String(REDIS_HOST),
      REDIS_PORT: String(REDIS_PORT),
      REDIS_KEYPREFIX: `${SERVICE_NAME}-cache`,
      REDIS_TTL_EXPIRE: String(REDIS_TTL_EXPIRE),

    };

    console.info({ envs })

    return envs;
  }

  public async mapEnvironments(): Promise<Map<string, IENVIRONMENTS>> {
    for (let index = 0; index < this.services.length; index++) {
      const serviceName = this.services[index];
      this.mapEnvParameters.set(serviceName, await this.loadEnvironments({SERVICE_NAME: serviceName}));
    }

    return this.mapEnvParameters;
  }

  public async buildClusterAndVPC(){
    console.info('Creates Basic Stack - Cluster and VPC')
    this.vpc = new ec2.Vpc(this, `${this.environmentService}-VPC`, {
      maxAzs: 2
    });

    this.cluster = new ecs.Cluster(this, `qd-${this.environmentService}-cluster`, {
      vpc: this.vpc,
      clusterName: `qd-${this.environmentService}-cluster`,
    });
  }

  private async buildECR ({ SERVICE_NAME }: ILoadEEnvParameters ){
    const nameECR = `${SERVICE_NAME}_${this.environmentService}_repo`;

    const newRepo = new ecr.Repository(this, nameECR, {
      imageScanOnPush: false,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      repositoryName: nameECR,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          description: 'Mantem somente 2 imagens no repositório',
          maxImageCount: 2, //FIXME pegar do parameter store
          tagStatus: TagStatus.UNTAGGED,
        }
      ]
    });

    this.repositories.set(SERVICE_NAME, newRepo);
  }

  public async buildECRS () {
    for (let index = 0; index < this.services.length; index++) {
      const serviceName = this.services[index];
      this.buildECR({SERVICE_NAME: serviceName});
    }
  }

  private async buildECS_APP_LoadBalanced({ SERVICE_NAME }: ILoadEEnvParameters) {
    const newRepo = this.repositories.get(SERVICE_NAME);
    if (!newRepo) throw new Error('ECR repository NOT FOUND!');

    const serviceEvs = this.mapEnvParameters.get(SERVICE_NAME);

    const appLoadBalanced = new ecs_patterns.ApplicationLoadBalancedFargateService(this, SERVICE_NAME, {
      cluster: this.cluster, // Required
      cpu: Number(serviceEvs?.CPU_LIMIT || 256), // Default is 256
      desiredCount: Number(serviceEvs?.DESIRED_COUNT || 1), // Default is 1
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(newRepo),
        environment: serviceEvs as unknown as {
          [key: string]: string;
        },
        containerPort: Number(serviceEvs?.PORT || 3000),
        
      },
      serviceName: SERVICE_NAME,
      deploymentController: { type: ecs.DeploymentControllerType.ECS },
      memoryLimitMiB: Number(serviceEvs?.MEMORY_LIMIT || 512), // Default is 512
      publicLoadBalancer: true // Default is false

    });

    this.appLoadBalenced.set(SERVICE_NAME, appLoadBalanced);
  }

  public async buildECS_APP_LoadBalanced_SERVICES() {
    for (let index = 0; index < this.services.length; index++) {
      const serviceName = this.services[index];
      await this.buildECS_APP_LoadBalanced({SERVICE_NAME: serviceName});
    }
  }

  public async buildRedisCache() {
    const redisPort = 6379;
    const redisSubnetGroup = new elasticcache.CfnSubnetGroup(this as any, 'redis-subnet-group', {
      cacheSubnetGroupName: 'redis-subnet-group',
      description: 'The redis subnet group id',
      subnetIds: this.vpc.privateSubnets.map(subnet => subnet.subnetId),
    });

    // The security group that defines network level access to the cluster
    const redisSecurityGroup = new ec2.SecurityGroup(this, 'redis-security-group',
      {
        vpc: this.vpc,
        allowAllOutbound: true,
        securityGroupName: 'redis-security-group',
      });
    redisSecurityGroup.addIngressRule(ec2.Peer.ipv4(this.vpc.vpcCidrBlock), ec2.Port.tcp(redisPort), 'Ingress LAN');

    const redisConnections = new ec2.Connections({
      securityGroups: [redisSecurityGroup],
      defaultPort: ec2.Port.tcp(redisPort)
    });

    const redis = new elasticcache.CfnCacheCluster(this as any, 'redis-cluster', {
      cacheNodeType: 'cache.t2.micro',
      engine: 'redis',
      engineVersion: '6.x',
      numCacheNodes: 1,
      clusterName: 'redis-cluster-cache',
      port: redisPort,
      cacheSubnetGroupName: redisSubnetGroup.cacheSubnetGroupName,
      vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId]
    });
    redis.addDependsOn(redisSubnetGroup);

    const redisUrl = "redis://" + redis.attrRedisEndpointAddress + ":" + redis.attrRedisEndpointPort;
    console.info({ redisUrl });

  }

}
