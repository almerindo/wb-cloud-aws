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
  SERVICE_NAME: string;
  ENVIRONMENT: string;
}

export class AwsStack extends cdk.Stack {
  cluster: Map<string, ecs.Cluster>;
  vpc: Map<string, ec2.Vpc>;
  repositories: Map<string, ecr.Repository>;
  appLoadBalenced: Map<string, ApplicationLoadBalancedFargateService>;
  mapEnvParameters: Map<string, IENVIRONMENTS>;

  services: string[] = [];
  environmentType: string[] ;
  envsParameters: IENVIRONMENTS;


  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    this.environmentType = ['stage', 'prod'];
    this.cluster = new Map();
    this.vpc = new Map();
    this.repositories = new Map();
    this.appLoadBalenced = new Map();
    this.mapEnvParameters = new Map();
    
    // this.serviceName = process.env.SERVICE_NAME  || null;
    this.services = process.env.SERVICES ? JSON.parse(process.env.SERVICES) : null;

  }

  private async loadEnvironments({ SERVICE_NAME, ENVIRONMENT }: ILoadEEnvParameters): Promise<IENVIRONMENTS> {
    const prefixPath = `/${ENVIRONMENT}/${SERVICE_NAME}`;

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

    return envs;
  }

  public async mapEnvironments() {
    for (let i = 0; i < this.environmentType.length; i++) {
      const typeEnvironment = this.environmentType[i];
      for (let index = 0; index < this.services.length; index++) {
        const serviceName = this.services[index];
        const payload = await this.loadEnvironments({SERVICE_NAME: serviceName,ENVIRONMENT: typeEnvironment})
        this.mapEnvParameters.set(`${typeEnvironment}_${serviceName}`, payload);      
      } 
    }
  }

  public async buildClusterAndVPC(){
    for (let index = 0; index < this.environmentType.length; index++) {
      const typeEnvironment = this.environmentType[index];
      this.vpc.set(`${typeEnvironment}-VPC`, new ec2.Vpc(this, `${typeEnvironment}-VPC`, {
        maxAzs: 2
      }));
  
      this.cluster.set( `qd-${typeEnvironment}-cluster`, 
        new ecs.Cluster(this, `qd-${typeEnvironment}-cluster`, {
        vpc: this.vpc.get(`${typeEnvironment}-VPC`),
        clusterName: `qd-${typeEnvironment}-cluster`,
      }));
      
    }
    console.info('Creates Basic Stack - Cluster and VPC')
    
  }

  private async buildECR ({ SERVICE_NAME, ENVIRONMENT }: ILoadEEnvParameters ){
    
    const nameECR = `${SERVICE_NAME}_${ENVIRONMENT}_repo`;

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

    this.repositories.set(nameECR, newRepo);
  }

  public async buildECRS () {
    for (let i = 0; i < this.environmentType.length; i++) {
      const environmentType = this.environmentType[i];
      for (let index = 0; index < this.services.length; index++) {
        const serviceName = this.services[index];
        this.buildECR({SERVICE_NAME: serviceName, ENVIRONMENT: environmentType});
      }
    }
    
  }

  private async buildECS_APP_LoadBalanced({ SERVICE_NAME, ENVIRONMENT }: ILoadEEnvParameters) {
    const newRepo = this.repositories.get(`${SERVICE_NAME}_${ENVIRONMENT}_repo`);
    if (!newRepo) throw new Error('ECR repository NOT FOUND!');

    const serviceEvs = await this.loadEnvironments({SERVICE_NAME,ENVIRONMENT});
    if (!serviceEvs) throw new Error('ENVS NOT FOUND!');
    
    //FIXME Reduzir recurso qd for ambiente de dev
    const appLoadBalanced = new ecs_patterns.ApplicationLoadBalancedFargateService(this, SERVICE_NAME, {
      cluster: this.cluster.get(`qd-${ENVIRONMENT}-cluster`), // Required
      cpu: 512, // Default is 256
      desiredCount: 1, // Default is 1
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

    this.appLoadBalenced.set(`${ENVIRONMENT}_${SERVICE_NAME}-ecs`, appLoadBalanced);
  }

  public async buildECS_APP_LoadBalanced_SERVICES() {
    for (let i = 0; i < this.environmentType.length; i++) {
      const environmentType = this.environmentType[i];
      for (let index = 0; index < this.services.length; index++) {
        const serviceName = this.services[index];
        await this.buildECS_APP_LoadBalanced({SERVICE_NAME: serviceName,ENVIRONMENT: environmentType });
      }
      
    }
    
  }

  public async buildRedisCache() {
    const redisPort = 6379;
    for (let index = 0; index < this.environmentType.length; index++) {
      const typeEnvironment = this.environmentType[index];
      const vpc = this.vpc.get(`${typeEnvironment}-VPC`);
      if (!vpc) throw new Error('VPC cannot be null!');

      const redisSubnetGroup = new elasticcache.CfnSubnetGroup(this as any, 'redis-subnet-group', {
        cacheSubnetGroupName: 'redis-subnet-group',
        description: 'The redis subnet group id',
        subnetIds: vpc.privateSubnets.map(subnet => subnet.subnetId),
      });

      // The security group that defines network level access to the cluster
      const redisSecurityGroup = new ec2.SecurityGroup(this, `redis-security-group_${typeEnvironment}`,
      {
        vpc: vpc,
        allowAllOutbound: true,
        securityGroupName: `redis-security-group_${typeEnvironment}`,
      });

      redisSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(redisPort), 'Ingress LAN');

      const redisConnections = new ec2.Connections({
        securityGroups: [redisSecurityGroup],
        defaultPort: ec2.Port.tcp(redisPort)
      });

      const redis = new elasticcache.CfnCacheCluster(this as any, `redis-cluster_${typeEnvironment}`, {
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

}
